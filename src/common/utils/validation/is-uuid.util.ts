const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a path or query value is shaped like a uuid.
 *
 * Used to answer "not found" for a malformed id rather than passing it to the
 * database, where a non-uuid raises a cast error and surfaces as a 500 — a
 * server fault reported for what is really a bad request. Route handlers take
 * ids as plain strings, matching the rest of the codebase, so the check belongs
 * here rather than in a param DTO.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
