import { registerAs } from "@nestjs/config";

export default registerAs("smtp", () => ({
  host: process.env.SMTP_HOST || "mailpit",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || "no-reply@neurox.local",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
}));
