import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { FastifyRequest } from "fastify";

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
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse();
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
