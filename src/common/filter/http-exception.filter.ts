import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from "@nestjs/common";
import { FastifyRequest, FastifyReply } from "fastify";

interface RequestWithId extends FastifyRequest {
  requestId?: string;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<RequestWithId>();
    const status = exception.getStatus();

    // Get the custom message (if provided) or default to the exception message
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === "object" && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>).message
        : exception.message;

    void response.status(status).send({
      status: false,
      statusCode: status,
      message: message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.requestId,
    });
  }
}
