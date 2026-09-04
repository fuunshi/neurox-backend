/**
 * What goes out over the socket, as opposed to what it is named.
 *
 * Kept apart from `realtime.types.ts` so the event vocabulary and the payload
 * shapes can be read independently, and so a producer can import a payload
 * without dragging the event names along with it.
 */

/**
 * Progress on one generation job.
 *
 * Sent to the deck's room and to the owning reader, so the deck screen can stop
 * polling rather than asking every 1.5 seconds whether a run has finished. A
 * generation over thirty chunks is the longest thing a reader waits for in this
 * product, and polling was always a stand-in for not having a socket.
 */
export interface JobProgressPayload {
  jobId: string;
  deckId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  cardsCreated: number | null;
}
