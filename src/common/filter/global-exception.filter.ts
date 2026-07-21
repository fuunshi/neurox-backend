import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import {
  CheckConstraintViolationException,
  DriverException,
  ForeignKeyConstraintViolationException,
  InvalidFieldNameException,
  NotNullConstraintViolationException,
  UniqueConstraintViolationException,
} from "@mikro-orm/core";
import { FastifyReply, FastifyRequest } from "fastify";
import { DATABASE_ERROR_MESSAGES, DatabaseErrorKey } from "../constant";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<RequestWithId>();

    const requestId = request.requestId;
    const path = request.url;

    const isHttpException = exception instanceof HttpException;

    // -----------------------------
    // 0. DATABASE ERROR HANDLING (MikroORM driver exceptions)
    // -----------------------------
    // The specific exceptions are checked before DriverException on purpose: it
    // is the base class of all of them, so matching it first would swallow the
    // cases that need a 409/400 instead of a 500.
    let databaseError:
      | { status: number; key: DatabaseErrorKey; error: DriverException }
      | undefined;

    if (exception instanceof UniqueConstraintViolationException) {
      databaseError = {
        status: 409,
        key: "UNIQUE_CONSTRAINT_VIOLATION",
        error: exception,
      };
    } else if (exception instanceof ForeignKeyConstraintViolationException) {
      databaseError = {
        status: 409,
        key: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
        error: exception,
      };
    } else if (exception instanceof NotNullConstraintViolationException) {
      databaseError = {
        status: 400,
        key: "NOT_NULL_CONSTRAINT_VIOLATION",
        error: exception,
      };
    } else if (exception instanceof CheckConstraintViolationException) {
      databaseError = {
        status: 400,
        key: "CHECK_CONSTRAINT_VIOLATION",
        error: exception,
      };
    } else if (exception instanceof InvalidFieldNameException) {
      databaseError = {
        status: 500,
        key: "INVALID_FIELD_NAME",
        error: exception,
      };
    } else if (exception instanceof DriverException) {
      databaseError = { status: 500, key: "DRIVER_ERROR", error: exception };
    }

    if (databaseError) {
      const { status, key, error } = databaseError;
      const message = DATABASE_ERROR_MESSAGES[key] || "Database error occurred";

      // log it as SYSTEM error (important)
      this.logger.error(
        `[${requestId}] ${path} | DatabaseError ${error.code} | ${error.message}`,
        error.stack,
      );

      return response.status(status).send({
        status: false,
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
        path,
        requestId,
      });
    }

    // -----------------------------
    // 1. LOGGING (ONLY unexpected errors)
    // -----------------------------
    if (!isHttpException) {
      if (exception instanceof Error) {
        this.logger.error(
          `[${requestId}] ${path} | ${exception.message}`,
          exception.stack,
        );
      } else {
        this.logger.error(
          `[${requestId}] ${path} | ${JSON.stringify(exception)}`,
        );
      }
    }

    // -----------------------------
    // 2. HTTP EXCEPTION RESPONSE
    // -----------------------------
    if (isHttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      const raw =
        typeof res === "object" && res !== null
          ? (res as Record<string, unknown>)
          : {};

      const message =
        typeof res === "object" && res !== null
          ? raw.message
          : exception.message;

      // Forward any non-standard keys the exception supplied -- e.g. the
      // `code`/`recoverableUntil` payload the registration flow throws when an
      // account is recoverable -- without letting them clobber the envelope.
      const extra = Object.fromEntries(
        Object.entries(raw).filter(
          ([key]) =>
            !["message", "statusCode", "status", "error"].includes(key),
        ),
      );

      return response.status(status).send({
        status: false,
        statusCode: status,
        message,
        ...extra,
        timestamp: new Date().toISOString(),
        path,
        requestId,
      });
    }

    // -----------------------------
    // 3. UNKNOWN ERROR RESPONSE
    // -----------------------------
    return response.status(500).send({
      status: false,
      statusCode: 500,
      message: "Something went wrong. Please try again later.",
      timestamp: new Date().toISOString(),
      path,
      requestId,
    });
  }
}
