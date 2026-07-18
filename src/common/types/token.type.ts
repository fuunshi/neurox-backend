export const TOKEN_TYPE = {
  ACCESS: "access",
  REFRESH: "refresh",
  MFA_TEMP: "mfa_temp",
  TEMP: "temp",
} as const;

export type JwtTokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export const TOKEN_PURPOSE = {
  MFA_VERIFY: "mfa_verify",
  MFA_ENABLE: "mfa_enable",
  UPDATE_PASSWORD: "update_password",
};

export type TokenPurpose = (typeof TOKEN_PURPOSE)[keyof typeof TOKEN_PURPOSE];
