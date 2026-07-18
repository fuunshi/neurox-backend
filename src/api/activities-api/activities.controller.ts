import { Controller, Get, Query, Req } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { ActivitiesListDTO } from "./dto/activities-list.dto";
import { ApiBearerAuth } from "@nestjs/swagger";
import { AuthenticatedRequest } from "@/common/types/request.type";

@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiBearerAuth()
  async getActivities(
    @Req() req: AuthenticatedRequest,
    @Query() dto: ActivitiesListDTO,
  ) {
    const user = req.authContext.user;
    return this.activitiesService.getActivities(user, dto);
  }
}
