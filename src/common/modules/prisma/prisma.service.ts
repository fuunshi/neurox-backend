import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    super({
      log: [
        {
          emit: "event",
          level: "query",
        },
        {
          emit: "event",
          level: "error",
        },
        {
          emit: "event",
          level: "warn",
        },
      ],
    });

    const isDev = configService.get("NODE_ENV") !== "production";

    const slowQueryThreshold = 500;

    this.$on("query", (event: Prisma.QueryEvent) => {
      if (isDev) {
        this.logger.debug(`[Query ${event.duration}ms]`);
        this.logger.verbose(event.query);
        this.logger.verbose(event.params);
        return;
      }

      if (event.duration >= slowQueryThreshold) {
        this.logger.verbose(event.query);
        this.logger.verbose(event.params);
        this.logger.warn(`[SLOW QUERY ${event.duration}ms]`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
