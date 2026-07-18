import { registerAs } from "@nestjs/config";

export default registerAs("redis", () => ({
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD,
}));
