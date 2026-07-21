/**
 * Injection token for the RabbitMQ (AMQP) mail client.
 *
 * This module is preserved, not wired: `InfraModule` exports the BullMQ
 * `MailQueueModule` (`@/infra/mail-queue`), and that is what services
 * inject. Nothing in the application imports this folder today — it exists so
 * the AMQP transport is kept in the live tree, ready to be switched on, rather
 * than stranded in the deleted legacy `src/infra` tree.
 */
export const MAIL_QUEUE_CLIENT = "MAIL_QUEUE_CLIENT";
