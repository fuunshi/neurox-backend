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
  mfaTempTokenExpiresIn: process.env.MFA_TEMP_TOKEN_EXPIRES_IN || "15m",
}));
