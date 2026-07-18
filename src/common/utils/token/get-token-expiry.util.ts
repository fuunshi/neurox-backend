import ms from "ms";
import { JwtSignOptions } from "@nestjs/jwt";

export function getTokenExpiry(duration?: JwtSignOptions["expiresIn"]): Date {
  const now = Date.now();

  // fallback
  if (duration == null) {
    return new Date(now + 24 * 60 * 60 * 1000);
  }

  const milliseconds =
    typeof duration === "number" ? duration * 1000 : ms(duration);

  return new Date(now + milliseconds);
}
