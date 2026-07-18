import {
  HttpException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";

/**
 * Handles errors by logging detailed context internally and throwing
 * a safe client-facing message.
 *
 * @param error - The caught error
 * @param logContext - Internal log message with debugging context (never shown to client)
 * @param logger - Logger instance for structured logging
 * @param clientMessage - Safe message returned to the client (defaults to generic message)
 */
export function handleError(
  error: unknown,
  logContext: string,
  logger: Logger = new Logger("GenericErrorHandler"),
  clientMessage = "Something went wrong. Please try again later.",
): never {
  if (error instanceof Error) {
    logger.error(`${logContext} | ${error.message}`, error.stack);
  } else {
    logger.error(`${logContext} | ${JSON.stringify(error)}`);
  }

  if (error instanceof HttpException) {
    throw error;
  }

  // For unexpected errors, throw a generic internal server error
  throw new InternalServerErrorException(logContext);
}
