import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FastifyReply, FastifyRequest } from "fastify";
import { PRISMA_ERROR_CODES } from "../constant";

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
    // 0. PRISMA ERROR HANDLING
    // -----------------------------
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const message =
        PRISMA_ERROR_CODES[exception.code] || "Database error occurred";

      // log it as SYSTEM error (important)
      this.logger.error(
        `[${requestId}] ${path} | PrismaError ${exception.code} | ${exception.message}`,
        exception.stack,
      );

      return response.status(409).send({
        status: false,
        statusCode: 409,
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

      const message =
        typeof res === "object" && res !== null
          ? (res as any).message
          : exception.message;

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
