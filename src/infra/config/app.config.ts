import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  frontendBaseUrl: process.env.FRONTEND_URL,
  /**
   * Browser origins allowed to call the API, comma-separated. An allowlist
   * rather than `*` because the only browser client is our own frontend, and
   * because a wildcard cannot be combined with credentials if a cookie-carrying
   * client ever appears. Defaults to the frontend's dev server, so a checkout
   * with no `.env` still works locally.
   */
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3001")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  appName: process.env.APP_NAME || "Neurox",
  supportEmail: process.env.SUPPORT_EMAIL,
}));
