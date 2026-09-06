import { AppModule } from "@/app.module";
import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { EXCEPTION_FILTERS_METADATA } from "@nestjs/common/constants";
import { RealtimeExceptionFilter } from "@/realtime/realtime-exception.filter";
import { RealtimeGateway } from "@/realtime/realtime.gateway";
import { randomUUID } from "node:crypto";
import type { Server } from "http";
import { io as openConnection, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The realtime socket, against a running server.
 *
 * Every other spec in this repo exercises a class in isolation, and the socket
 * is the one thing that cannot be tested that way: its whole contract is the
 * handshake and the rooms, and both live in Socket.IO's plumbing rather than in
 * any method this repo owns. `realtime.ticket.spec.ts` proves a ticket verifies;
 * it cannot prove a connection opens with one, that an access token is refused,
 * or that a notification written by an HTTP request actually reaches a socket
 * belonging to the right reader. Those are the claims the feature makes, so they
 * are what this file asserts.
 *
 * It needs PostgreSQL and Redis, like `app.e2e-spec.ts`, and it needs the demo
 * account (`pnpm run seed`) because it signs in as a real user rather than
 * forging a token — a hand-built JWT would prove the socket reads a signature,
 * not that a signed-in reader gets their own notifications.
 */

const DEMO = { email: "admin@neurox.ai", password: "demo_admin@123" };

/** Long enough for a cold handshake on a loaded machine, short enough that a
 *  broken one fails the suite rather than hanging it. */
const SETTLE_MS = 10_000;

/** How long a socket must stay connected after `connect` to count as accepted.
 *  Long enough for the server's post-handshake disconnect to arrive. */
const SETTLE_GRACE_MS = 750;

type Handshake = { ok: true; socket: Socket } | { ok: false; message: string };

/** A deck as the list route answers it — only the fields this file reads. */
interface ListedDeck {
  id: string;
  cardCount: number;
}

/**
 * The payload inside the response envelope, typed.
 *
 * Every route answers through `ResponseInterceptor`'s `{ success, data, ... }`,
 * and supertest types `body` as `any` — which the lint rules refuse to read
 * through. Unwrapping in one place keeps that cast out of every call site.
 */
function envelope<T>(res: request.Response): T {
  return (res.body as { data: T }).data;
}

describe("Realtime socket (e2e)", () => {
  let app: INestApplication<Server>;
  let server: Server;
  let baseUrl: string;
  let accessToken: string;

  /** Every socket this file opened, so `afterAll` can close them. A socket left
   *  open holds the event loop and the suite never exits. */
  const opened = new Set<Socket>();

  /** Decks this file created, deleted again in `afterAll` so repeated runs do
   *  not silt up the demo account with titled-but-empty decks. */
  const createdDecks = new Set<string>();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // A real port, unlike `app.e2e-spec.ts`: supertest drives the server
    // in-process, but a socket client dials a URL, so something has to be
    // listening. Port 0 asks the OS for a free one, which keeps this from
    // colliding with a dev server on 3232.
    server = (await app.listen(0)) as Server;
    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("The test server did not bind a TCP port.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;

    const login = await request(server).post("/auth/login").send(DEMO);

    // 201, not 200: Nest answers a POST with 201 unless a route says otherwise,
    // and `login` does not.
    if (login.status !== 201) {
      throw new Error(
        `Sign-in failed (${login.status}). Is the demo account seeded? ` +
          "Run `pnpm run seed`.",
      );
    }

    accessToken = envelope<{ accessToken: string }>(login).accessToken;
  }, 60_000);

  afterAll(async () => {
    for (const socket of opened) socket.close();
    opened.clear();

    for (const deckId of createdDecks) {
      await request(server)
        .delete(`/decks/${deckId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .catch(() => undefined);
    }
    createdDecks.clear();

    // As in `app.e2e-spec.ts`: `app.close()` waits on teardown that does not
    // complete, so it is raced rather than awaited.
    await Promise.race([
      Promise.resolve(app?.close()).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }, 30_000);

  /**
   * Opens a socket and reports whether it is still connected once the server
   * has had its say.
   *
   * Deliberately not "resolve on the first of connect/connect_error": Socket.IO
   * completes the handshake and *then* Nest runs `handleConnection`, which
   * disconnects a client it will not authenticate. So a refused client still
   * sees `connect`, immediately followed by `disconnect` — resolving on
   * `connect` would read every refusal as a success. What is asserted is the
   * state after that has had time to land.
   */
  function connect(auth: Record<string, unknown>): Promise<Handshake> {
    return new Promise((resolve) => {
      const socket = openConnection(`${baseUrl}/realtime`, {
        auth,
        // WebSocket only, so a failure is the gateway refusing the ticket
        // rather than a polling fallback quietly succeeding.
        transports: ["websocket"],
        reconnection: false,
        forceNew: true,
      });

      opened.add(socket);

      let settled = false;

      const settle = (outcome: Handshake) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        resolve(outcome);
      };

      socket.once("connect_error", (error: Error) =>
        settle({ ok: false, message: error.message }),
      );

      socket.once("connect", () => {
        setTimeout(() => {
          settle(
            socket.connected
              ? { ok: true, socket }
              : { ok: false, message: "Disconnected after connecting." },
          );
        }, SETTLE_GRACE_MS);
      });

      const deadline = setTimeout(
        () =>
          settle({
            ok: false,
            message: "The handshake neither connected nor failed.",
          }),
        SETTLE_MS,
      );
    });
  }

  /** Opens a socket that is expected to work, or fails loudly. */
  async function connectOrFail(): Promise<Socket> {
    const handshake = await connect({ ticket: await mintTicket() });

    if (!handshake.ok) {
      throw new Error(`Expected a connection, got: ${handshake.message}`);
    }

    return handshake.socket;
  }

  async function mintTicket(): Promise<string> {
    const res = await request(server)
      .post("/auth/realtime-ticket")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    return envelope<{ ticket: string }>(res).ticket;
  }

  /**
   * Waits for whichever of `expected` arrives first.
   *
   * Resolves as `"timeout"` rather than hanging, so a server that answers with
   * silence fails an assertion instead of stalling the suite. Callers that pair
   * this with a request must arm it *before* the request: a notification is
   * emitted while the write that produced it is still being served.
   */
  function listenFor<T>(
    socket: Socket,
    expected: string[],
  ): Promise<{ event: string; payload: T }> {
    return new Promise((resolve) => {
      const listeners = new Map<string, (data: T) => void>();

      const settle = (name: string, data: T) => {
        clearTimeout(timer);
        for (const [eventName, listener] of listeners) {
          socket.off(eventName, listener);
        }
        resolve({ event: name, payload: data });
      };

      for (const name of expected) {
        const listener = (data: T) => settle(name, data);
        listeners.set(name, listener);
        socket.on(name, listener);
      }

      const timer = setTimeout(
        () => settle("timeout", null as unknown as T),
        SETTLE_MS,
      );
    });
  }

  /** Sends a client event and resolves with the server's answer to it. */
  function exchange<T>(
    socket: Socket,
    event: string,
    payload: unknown,
    expected: string[],
  ): Promise<{ event: string; payload: T }> {
    const waiting = listenFor<T>(socket, expected);
    socket.emit(event, payload);
    return waiting;
  }

  /**
   * A deck the demo account owns that actually holds cards.
   *
   * Deliberately not simply the first row: the list is newest-first and this
   * file creates decks, so `data[0]` is a deck an earlier run left empty —
   * exporting which yields a header row and nothing else, and an import of
   * nothing is a 400 rather than a notification.
   */
  async function deckWithCards(): Promise<string> {
    const res = await request(server)
      .get("/decks")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const deck = envelope<{ data: ListedDeck[] }>(res).data.find(
      (candidate) => candidate.cardCount > 0,
    );

    if (!deck) {
      throw new Error("No deck with cards. Run `pnpm run seed`.");
    }

    return deck.id;
  }

  /** Creates a deck and remembers it, so the suite can delete what it made. */
  async function createDeck(title: string): Promise<string> {
    const res = await request(server)
      .post("/decks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title });

    expect(res.status).toBe(201);

    const id = envelope<{ id: string }>(res).id;
    createdDecks.add(id);
    return id;
  }

  /**
   * A real write that produces a notification: export a populated deck and
   * import it into a fresh one. `deck.service.ts` records `CARDS_IMPORTED` and
   * pushes it, and that push is the event under test.
   */
  async function importIntoANewDeck(title: string): Promise<void> {
    const source = await deckWithCards();

    const exported = await request(server)
      .get(`/decks/${source}/export`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(exported.status).toBe(200);

    const target = await createDeck(title);

    const imported = await request(server)
      .post(`/decks/${target}/import`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: exported.text, format: "csv" });

    expect(imported.status).toBe(201);
    expect(envelope<{ created: number }>(imported).created).toBeGreaterThan(0);
  }

  // ── The handshake ────────────────────────────────────────────────────────

  it("declares its exception filter on the gateway, because globals do not reach sockets", () => {
    // Nest's WebSocket filter context returns an empty `getGlobalMetadata()`,
    // so an `APP_FILTER` — including this project's `GlobalExceptionFilter` — is
    // never applied to a message. The only filter a socket gets is one declared
    // on the gateway, and without it socket errors fall back to Nest's default,
    // which logs them as `{}` and answers on an event no client listens for.
    //
    // Asserted because deleting the decorator breaks nothing loudly: the socket
    // keeps working and only the error reporting quietly rots.
    const filters = Reflect.getMetadata(
      EXCEPTION_FILTERS_METADATA,
      RealtimeGateway,
    ) as unknown[] | undefined;

    expect(filters).toContain(RealtimeExceptionFilter);
  });

  it("refuses a connection that presents no ticket", async () => {
    const handshake = await connect({});

    expect(handshake.ok).toBe(false);
  });

  it("refuses an access token offered as a ticket", async () => {
    // The claim `realtime.ticket.ts` is built on: the session is not a socket
    // credential, so putting it in JavaScript does not open a socket. If this
    // ever passes, the ticket has become a formality.
    const handshake = await connect({ ticket: accessToken });

    expect(handshake.ok).toBe(false);
  });

  it("refuses a ticket-shaped string that was never signed", async () => {
    const handshake = await connect({ ticket: "not.a.jwt" });

    expect(handshake.ok).toBe(false);
  });

  it("opens with a ticket minted from the session", async () => {
    const handshake = await connect({ ticket: await mintTicket() });

    expect(handshake.ok).toBe(true);

    if (handshake.ok) expect(handshake.socket.connected).toBe(true);
  });

  it("mints a ticket that carries the reader and nothing else", async () => {
    const ticket = await mintTicket();
    const claims = JSON.parse(
      Buffer.from(ticket.split(".")[1], "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    expect(claims.type).toBe("realtime");
    expect(claims.sub).toBeTruthy();
    // Nothing that would widen if the ticket leaked out of JavaScript.
    expect(claims).not.toHaveProperty("role");
    expect(claims).not.toHaveProperty("scope");
  });

  it("refuses the ticket as a REST credential", async () => {
    // The other half of the same claim: the one credential the browser is
    // handed cannot be replayed into anything that reads data.
    const res = await request(server)
      .get("/decks")
      .set("Authorization", `Bearer ${await mintTicket()}`);

    expect(res.status).toBe(401);
  });

  // ── Subscriptions ────────────────────────────────────────────────────────

  it("subscribes to a deck the reader owns", async () => {
    const socket = await connectOrFail();
    const deckId = await deckWithCards();

    const answer = await exchange<{ topic: string }>(
      socket,
      "subscribe",
      { topic: `deck:${deckId}` },
      ["subscribed", "realtime:error"],
    );

    expect(answer.event).toBe("subscribed");
    expect(answer.payload).toMatchObject({ topic: `deck:${deckId}` });
  });

  it("refuses a deck the reader does not own", async () => {
    // A real uuid, so this fails on ownership rather than on the format check
    // that runs before the query.
    const socket = await connectOrFail();

    const answer = await exchange(
      socket,
      "subscribe",
      { topic: `deck:${randomUUID()}` },
      ["subscribed", "realtime:error"],
    );

    expect(answer.event).toBe("realtime:error");
  });

  it("refuses a topic that was never declared", async () => {
    const socket = await connectOrFail();

    const answer = await exchange(
      socket,
      "subscribe",
      { topic: `user:${randomUUID()}` },
      ["subscribed", "realtime:error"],
    );

    expect(answer.event).toBe("realtime:error");
  });

  it("refuses a subscription sent with no topic at all", async () => {
    const socket = await connectOrFail();

    const answer = await exchange(socket, "subscribe", {}, [
      "subscribed",
      "realtime:error",
    ]);

    expect(answer.event).toBe("realtime:error");
  });

  // ── Delivery ─────────────────────────────────────────────────────────────

  it("pushes a notification written by an HTTP request to the reader's socket", async () => {
    const socket = await connectOrFail();

    // Armed before the request that produces it: the notification is emitted
    // while the import is still being served, so listening afterwards would
    // miss it.
    const arriving = listenFor<{
      notification: { type: string; title: string; body: string };
      unreadCount: number;
    }>(socket, ["notification"]);

    await importIntoANewDeck(`Socket e2e ${randomUUID().slice(0, 8)}`);

    const { event, payload } = await arriving;

    expect(event).toBe("notification");
    expect(payload.notification.type).toBe("CARDS_IMPORTED");

    // The row holds a template key and its parameters; the sentence is rendered
    // server-side, so a client is never handed text of its own to display.
    expect(payload.notification.title).toBeTruthy();
    expect(payload.notification.body).toBeTruthy();
    expect(typeof payload.unreadCount).toBe("number");
    expect(payload.unreadCount).toBeGreaterThan(0);
  });

  it("tells the reader's sockets when the unread count moves", async () => {
    const socket = await connectOrFail();

    // Something has to be unread before a count can fall from it. Creating a
    // deck is not enough — a deck is an activity row, not a notification.
    await importIntoANewDeck(`Read-all e2e ${randomUUID().slice(0, 8)}`);

    const moving = listenFor<{ unreadCount: number }>(socket, [
      "unread-changed",
    ]);

    const readAll = await request(server)
      .post("/notifications/read-all")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(readAll.status).toBe(200);

    const { event, payload } = await moving;

    expect(event).toBe("unread-changed");
    expect(payload.unreadCount).toBe(0);
  });

  it("serves the same notifications over REST with no socket at all", async () => {
    // The badge has to be right on a cold page load, before any socket exists —
    // so the list is a REST read and the socket only adds to it.
    const res = await request(server)
      .get("/notifications")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);

    const page = envelope<{
      data: unknown[];
      unreadCount: number;
      hasMore: boolean;
    }>(res);

    expect(Array.isArray(page.data)).toBe(true);
    expect(typeof page.unreadCount).toBe("number");
    expect(page).toHaveProperty("hasMore");
  });

  it("puts a second connection for the same reader in the same room", async () => {
    // A second tab asks for nothing: both sockets join the owner's room on
    // connect, which is why a notification reaches every device.
    const first = await connectOrFail();
    const second = await connectOrFail();

    const onFirst = listenFor<{ notification: { type: string } }>(first, [
      "notification",
    ]);
    const onSecond = listenFor<{ notification: { type: string } }>(second, [
      "notification",
    ]);

    await importIntoANewDeck(`Two tabs e2e ${randomUUID().slice(0, 8)}`);

    const [a, b] = await Promise.all([onFirst, onSecond]);

    expect(a.event).toBe("notification");
    expect(b.event).toBe("notification");
  });
});
