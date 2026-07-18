import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { Public } from "./common/decorators/auth.decorator";
import { SkipThrottle } from "@nestjs/throttler";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @SkipThrottle()
  getHello(): string {
    return this.appService.getHello();
  }
}
