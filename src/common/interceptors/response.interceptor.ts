import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { FastifyReply, FastifyRequest } from "fastify";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
}

export interface ResponseFormat<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  requestId: string;
  timestamp: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseFormat<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseFormat<T>> {
    // HTTP-only. The envelope below is the REST envelope, and wrapping a
    // WebSocket message in it would stop Nest recognising the `{ event, data }`
    // a handler returns — so a socket message must pass through untouched. The
    // cast is because the declared return type describes the wrapped branch
    // only; nothing is converted on this path.
    if (context.getType() !== "http") {
      return next.handle() as Observable<ResponseFormat<T>>;
    }

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const requestId = request.requestId || "unknown";

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: response.statusCode,
        message: "Request successful",
        data: data as T,
        requestId,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
