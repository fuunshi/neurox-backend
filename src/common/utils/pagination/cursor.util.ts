export interface CursorPayload {
  id: string;
  /** ISO timestamp of the row's `createdAt`. */
  createdAt: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Decodes a cursor, returning `null` for anything unusable.
 *
 * A malformed cursor is treated as absent rather than throwing: the previous
 * implementation would have surfaced a Base64 error to the client, which is a
 * worse outcome than simply starting from the first page.
 */
export function decodeCursor(raw?: string): CursorPayload | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8"),
    );

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as CursorPayload).id !== "string" ||
      typeof (parsed as CursorPayload).createdAt !== "string"
    ) {
      return null;
    }

    return parsed as CursorPayload;
  } catch {
    return null;
  }
}

/**
 * A keyset predicate, shaped so it can be spread into a `FilterQuery`.
 *
 * Deliberately a concrete interface rather than `FilterQuery<T>`: that type is
 * a union, which TypeScript refuses to spread.
 */
export interface KeysetClause {
  $or?: Record<string, unknown>[];
}

/**
 * Builds the keyset predicate that resumes a list ordered by
 * `[createdAt desc, id desc]`.
 *
 * MikroORM has no positional cursor, so paging continues from the last row's
 * `(createdAt, id)` pair instead of an offset. The `id` tiebreak matters: rows
 * sharing a `createdAt` would otherwise be skipped or repeated at a page
 * boundary.
 */
export function keysetAfter(cursor: CursorPayload | null): KeysetClause {
  if (!cursor) return {};

  const createdAt = new Date(cursor.createdAt);

  return {
    $or: [
      { createdAt: { $lt: createdAt } },
      { createdAt, id: { $lt: cursor.id } },
    ],
  };
}

/**
 * Normalises a `limit + 1` fetch into a page plus its follow-up cursor.
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): {
  data: T[];
  pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
} {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];

  return {
    data,
    pagination: {
      nextCursor:
        hasMore && last
          ? encodeCursor({
              id: last.id,
              createdAt: last.createdAt.toISOString(),
            })
          : null,
      hasMore,
      limit,
    },
  };
}
