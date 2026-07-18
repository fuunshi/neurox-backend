import { PRISMA_ERROR_CODES } from "@/common/constant";
import {
  ConflictException,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function handlePrismaError(
  error: unknown,
  contextMessage = "An error occurred",
  logger: Logger = new Logger("PrismaErrorHandler"),
): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const message = PRISMA_ERROR_CODES[error.code] || "Database error occurred";
    throw new ConflictException(message);
  }
  logger.error("Error occurred during user creation.");

  throw new InternalServerErrorException(contextMessage);
}
