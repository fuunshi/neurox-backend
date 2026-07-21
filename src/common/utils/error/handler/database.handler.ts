import { DATABASE_ERROR_MESSAGES } from "@/common/constant";
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import {
  CheckConstraintViolationException,
  ForeignKeyConstraintViolationException,
  NotNullConstraintViolationException,
  UniqueConstraintViolationException,
} from "@mikro-orm/core";

export function handleDatabaseError(
  error: unknown,
  contextMessage = "An error occurred",
  logger: Logger = new Logger("DatabaseErrorHandler"),
): never {
  // The specific exceptions are checked before DriverException on purpose: it is
  // the base class of all of them, so matching it first would swallow the cases
  // that need a 409/400 instead of a 500.
  if (
    error instanceof UniqueConstraintViolationException ||
    error instanceof ForeignKeyConstraintViolationException
  ) {
    const message =
      error instanceof UniqueConstraintViolationException
        ? DATABASE_ERROR_MESSAGES.UNIQUE_CONSTRAINT_VIOLATION
        : DATABASE_ERROR_MESSAGES.FOREIGN_KEY_CONSTRAINT_VIOLATION;

    throw new ConflictException(message);
  }

  if (
    error instanceof NotNullConstraintViolationException ||
    error instanceof CheckConstraintViolationException
  ) {
    const message =
      error instanceof NotNullConstraintViolationException
        ? DATABASE_ERROR_MESSAGES.NOT_NULL_CONSTRAINT_VIOLATION
        : DATABASE_ERROR_MESSAGES.CHECK_CONSTRAINT_VIOLATION;

    throw new BadRequestException(message);
  }

  // InvalidFieldNameException, every other DriverException subclass and non-driver
  // errors all fall through to here: they are programming/infrastructure failures,
  // so the details stay in the log and the client gets a generic 500.
  logger.error(`${contextMessage} :: ${String(error)}`);

  throw new InternalServerErrorException(contextMessage);
}
