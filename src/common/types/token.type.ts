export const TOKEN_TYPE = {
  ACCESS: "access",
  REFRESH: "refresh",
  MFA_TEMP: "mfa_temp",
  TEMP: "temp",
  /**
   * A one-shot ticket for opening a realtime socket. See `realtime.ticket.ts`.
   *
   * Deliberately its own type rather than a reused access token: `AuthGuard`
   * admits only the types a route declares through `@AllowTokenTypes`, and no
   * route declares this one — so a ticket that leaks out of the handshake
   * cannot be replayed against the REST API.
   */
  REALTIME: "realtime",
} as const;

export type JwtTokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export const TOKEN_PURPOSE = {
  MFA_VERIFY: "mfa_verify",
  MFA_ENABLE: "mfa_enable",
  UPDATE_PASSWORD: "update_password",
};

export type TokenPurpose = (typeof TOKEN_PURPOSE)[keyof typeof TOKEN_PURPOSE];
