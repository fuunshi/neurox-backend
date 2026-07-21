import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from "@nestjs/common";
import { Observable, tap, catchError } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { AppLoggerService } from "@/infra/logger/logger.service";
import { FastifyRequest, FastifyReply } from "fastify";

export const REQUEST_ID_HEADER = "X-Request-ID";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
}

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const startTime = Date.now();

    // Generate or use existing request ID
    const requestId: string =
      (request.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || uuidv4();
    request.requestId = requestId;

    // Set request ID in response headers
    void response.header(REQUEST_ID_HEADER, requestId);

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
