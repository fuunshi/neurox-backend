import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap, catchError } from "rxjs";
import { FastifyRequest, FastifyReply } from "fastify";
import { EntityManager } from "@mikro-orm/postgresql";
import { RequestLog, User } from "@/database/entities";
import { SKIP_LOGGING_KEY } from "@/common/decorators/auth.decorator";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
  user?: { userId: string };
}

/**
 * `catchError` re-throws whatever was thrown: normally an `HttpException`,
 * whose `status` is private to TS but present at runtime, though any value can
 * surface here. Only the fields that get logged are named.
 */
interface LoggedError {
  status?: number;
  message?: string;
  stack?: string;
}

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  constructor(
    private readonly em: EntityManager,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // HTTP-only. This interceptor writes a `request_log` row from Fastify
    // fields, and a global interceptor runs for WebSocket messages too — where
    // those fields do not exist. A socket message is not an HTTP request and
    // does not belong in that table.
    if (context.getType() !== "http") return next.handle();

    // Infrastructure routes — a metrics scrape, a container healthcheck — opt
    // out: they are on timers rather than driven by anyone, and persisting them
    // would bury the rows that describe actual use.
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LOGGING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startTime = Date.now();

    const requestId = request.requestId || "unknown";
    const userId = request.user?.userId || null;
    const method = request.method;
    const path = request.url;
    const ipAddress = request.ip;
    const userAgent = request.headers["user-agent"];

    // Sanitize body - remove sensitive fields
    const sanitizedBody = this.sanitizeBody(
      request.body as Record<string, unknown>,
    );
    const sanitizedQuery = request.query as Record<string, unknown>;

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - startTime;
        const statusCode = response.statusCode;

        void this.logRequest({
          requestId,
          userId,
          method,
          path,
          query: sanitizedQuery,
          body: sanitizedBody,
          statusCode,
          responseTime,
          ipAddress,
          userAgent,
        });
      }),
      catchError(async (error: unknown) => {
        const responseTime = Date.now() - startTime;
        const { status, message, stack } = error as LoggedError;
        const statusCode = status || 500;

        await this.logRequest({
          requestId,
          userId,
          method,
          path,
          query: sanitizedQuery,
          body: sanitizedBody,
          statusCode,
          responseTime,
          ipAddress,
          userAgent,
          errorMessage: message,
          errorStack: stack,
        });

        throw error;
      }),
    );
  }

  private async logRequest(data: {
    requestId: string;
    userId: string | null;
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    statusCode: number;
    responseTime: number;
    ipAddress?: string;
    userAgent?: string;
    errorMessage?: string;
    errorStack?: string;
  }): Promise<void> {
    try {
      this.em.create(RequestLog, {
        requestId: data.requestId,
        // `user` is the relation; the scalar `userId` property is gone.
        user: data.userId ? this.em.getReference(User, data.userId) : null,
        method: data.method,
        path: data.path,
        query: data.query ?? null,
        body: data.body ?? null,
        // MikroORM v7 requires JSON columns to be present in create data even
        // when nullable and unused; the old Prisma call simply omitted it.
        headers: null,
        statusCode: data.statusCode,
        responseTime: data.responseTime,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        errorMessage: data.errorMessage,
        errorStack: data.errorStack,
      });
      await this.em.flush();
    } catch (error) {
      // Silently fail - don't let logging errors affect the request
      console.error("Failed to log request:", error);
    }
  }

  private sanitizeBody(
    body?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!body) return undefined;

    const sensitiveFields = [
      "password",
      "confirmPassword",
      "currentPassword",
      "newPassword",
      "token",
      "accessToken",
      "refreshToken",
      "secret",
      "apiKey",
      "creditCard",
      "cvv",
    ];

    const sanitized = { ...body };
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = "[REDACTED]";
      }
    }

    return sanitized;
  }
}
