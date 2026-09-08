import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from "@nestjs/common";
import { Observable, tap, catchError } from "rxjs";
import { Reflector } from "@nestjs/core";
import { v4 as uuidv4 } from "uuid";
import { AppLoggerService } from "@/infra/logger/logger.service";
import { FastifyRequest, FastifyReply } from "fastify";
import { SKIP_LOGGING_KEY } from "@/common/decorators/auth.decorator";

export const REQUEST_ID_HEADER = "X-Request-ID";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // HTTP-only. This interceptor reads a Fastify request and writes a response
    // header, but a global interceptor runs for WebSocket messages too — and
    // there `switchToHttp()` hands back the socket client, which has no
    // `headers`. Without this, every `subscribe` threw before reaching its
    // handler and the socket answered nothing but "Internal server error".
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startTime = Date.now();

    // Generate or use existing request ID
    const requestId: string =
      (request.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || uuidv4();
    request.requestId = requestId;

    // Set request ID in response headers
    void response.header(REQUEST_ID_HEADER, requestId);

    // Infrastructure routes opt out of the *logging*, not of the id: a metrics
    // scrape still gets its header and still correlates, it just does not
    // announce itself every fifteen seconds. The id has to be assigned either
    // way, because `ResponseInterceptor` and `GlobalExceptionFilter` read it.
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_LOGGING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const method: string = request.method;
    const url: string = request.url;

    this.logger.log(
      `Incoming request: ${method} ${url}`,
      `RequestID: ${requestId}`,
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode: number = response.statusCode;

        this.logger.logRequest(
          requestId,
          method,
          url,
          statusCode,
          duration,
          "RequestIdInterceptor",
        );
      }),
      catchError((error: HttpException | Error) => {
        const duration = Date.now() - startTime;
        const statusCode: number =
          error instanceof HttpException ? error.getStatus() : 500;

        this.logger.error(
          `Request failed: ${method} ${url} - ${error.message}`,
          error.stack,
          `RequestID: ${requestId}`,
        );

        this.logger.logRequest(
          requestId,
          method,
          url,
          statusCode,
          duration,
          "RequestIdInterceptor",
        );

        throw error;
      }),
    );
  }
}
