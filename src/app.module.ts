import { Module, ValidationPipe } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthGuard } from "./common/guard/auth.guard";
import { GlobalExceptionFilter } from "./common/filter/global-exception.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { RequestLogInterceptor } from "./common/interceptors/request-log.interceptor";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { ApiModule } from "./api/api.module";
import { ApplicationModule } from "./application/application.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { InfraModule } from "./infra/infra.module";

@Module({
  imports: [
    InfraModule,
    IntegrationsModule,
    ApplicationModule,
    ApiModule,
    // JwtModule is registered by InfraModule so the worker gets it too.
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: false,
        },
      }),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLogInterceptor,
    },
  ],
})
export class AppModule {}
