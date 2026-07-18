import { randomBytes } from "crypto";

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!%*?&#";

export function generateTemporaryPassword(length = 14): string {
  const bytes = randomBytes(length);

  return Array.from(bytes)
    .map((byte) => TEMP_PASSWORD_CHARS[byte % TEMP_PASSWORD_CHARS.length])
    .join("");
}
