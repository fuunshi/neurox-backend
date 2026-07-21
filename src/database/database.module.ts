import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ENTITIES } from "./entities";

/**
 * Replaces the former `PrismaModule`.
 *
 * No `@Global()` here: `MikroOrmModule.forRoot()` already pulls in
 * `@mikro-orm/nestjs`'s own global core module, so `EntityManager`, `MikroORM`
 * and the repositories are injectable application-wide without re-exporting.
 */
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      // REQUIRED. With `useFactory`/`inject`, @mikro-orm/nestjs cannot infer the
      // driver, so it registers only the generic `EntityManager` token and the
      // driver-specific `PostgreSqlEntityManager` that services actually inject
      // is never provided -- every such service then fails DI resolution at boot.
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        entities: ENTITIES,
        // A Prisma-era URL may carry `?schema=public`; the pg driver rejects it.
        clientUrl: configService
          .getOrThrow<string>("database.url")
          .split("?")[0],
        debug: configService.get<string>("app.nodeEnv") !== "production",
      }),
    }),
  ],
})
export class DatabaseModule {}
