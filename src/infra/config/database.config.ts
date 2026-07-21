import { registerAs } from "@nestjs/config";

export default registerAs("database", () => ({
  // Read as `database.url`. A Prisma-era URL may carry `?schema=public`;
  // consumers strip it before handing the URL to the pg driver.
  url: process.env.DATABASE_URL,
}));
