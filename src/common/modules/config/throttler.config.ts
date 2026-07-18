import { registerAs } from "@nestjs/config";

export default registerAs("throttler", () => ({
  short: {
    ttl: parseInt(process.env.THROTTLE_SHORT_TTL || "1000", 10),
    limit: parseInt(process.env.THROTTLE_SHORT_LIMIT || "3", 10),
  },
  medium: {
    ttl: parseInt(process.env.THROTTLE_MEDIUM_TTL || "10000", 10),
    limit: parseInt(process.env.THROTTLE_MEDIUM_LIMIT || "20", 10),
  },
  long: {
    ttl: parseInt(process.env.THROTTLE_LONG_TTL || "60000", 10),
    limit: parseInt(process.env.THROTTLE_LONG_LIMIT || "100", 10),
  },
}));
