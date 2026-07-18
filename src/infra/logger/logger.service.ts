import { Injectable, LoggerService, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pino, { Logger } from "pino";
import { join } from "path";

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly logger: Logger;
  private readonly errorLogger: Logger;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    // Logs directory in project root
    const logsDir = join(process.cwd(), "logs");
    const isProduction = this.configService.get<boolean>("app.isProduction");

    // Normal logger for info, debug, verbose, warn
    this.logger = pino({
      transport: {
        target: "pino/file",
        options: {
          destination: isProduction ? join(logsDir, "app.log") : 1,
          mkdir: true,
        },
      },
      level: "debug",
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });

    // Error logger for error and fatal logs
    this.errorLogger = pino({
      transport: {
        target: "pino/file",
        options: {
          destination: isProduction ? join(logsDir, "error.log") : 2,
          mkdir: true,
        },
      },
      level: "error",
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  log(message: string, context?: string): void {
    this.logger.info({ context, message });
  }

  error(message: string, trace?: string, context?: string): void {
    this.errorLogger.error({ context, message, trace });
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context, message });
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context, message });
  }

  verbose(message: string, context?: string): void {
    this.logger.trace({ context, message });
  }

  fatal(message: string, context?: string): void {
    this.errorLogger.fatal({ context, message });
  }

  logRequest(
    requestId: string,
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    context?: string,
  ): void {
    const logData = {
      requestId,
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      context,
    };

    if (statusCode >= 400) {
      this.errorLogger.error(logData);
    } else {
      this.logger.info(logData);
    }
  }
}
