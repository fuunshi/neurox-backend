import { registerAs } from "@nestjs/config";

export default registerAs("auth", () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "5m",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "1d",
  passwordResetTokenExpiresIn:
    process.env.PASSWORD_RESET_TOKEN_EXPIRES_IN || "15m",
  tokenHashSecret: process.env.TOKEN_HASH_SECRET,
  emailVerificationTokenExpiresIn:
    process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_IN || "15m",
  /**
   * The half-authenticated token a password check alone earns. Short on
   * purpose: it buys a session as soon as a code is supplied, so the window in
   * which a leaked password can be replayed is the time it takes to read one.
   */
  mfaTempTokenExpiresIn: process.env.MFA_TEMP_TOKEN_EXPIRES_IN || "5m",
  /**
   * Lifetime of a realtime socket ticket.
   *
   * Short by design. A WebSocket handshake cannot carry the session's httpOnly
   * cookie to another origin, so this is the one credential the browser is
   * handed — and the window in which stealing it is worth anything is the time
   * between asking for it and using it, which is milliseconds. An open socket
   * stays open; only new connections need a fresh ticket.
   */
  realtimeTicketExpiresIn: process.env.REALTIME_TICKET_EXPIRES_IN || "1m",
}));
