import { registerAs } from "@nestjs/config";

export default registerAs("rabbitmq", () => ({
  urls: (
    process.env.RABBITMQ_URLS ||
    process.env.RABBITMQ_URL ||
    "amqp://localhost:5672"
  ).split(","),
  mailQueue: process.env.RABBITMQ_MAIL_QUEUE || "mail.outbound",
  queueDurable: process.env.RABBITMQ_QUEUE_DURABLE !== "false",
}));
