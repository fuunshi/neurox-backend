import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  frontendBaseUrl: process.env.FRONTEND_URL,
  clientBaseUrl: process.env.CLIENT_URL,
  researcherBaseUrl: process.env.RESEARCHER_URL,
  appName: process.env.APP_NAME || "neurox",
  supportEmail: process.env.SUPPORT_EMAIL,
}));
