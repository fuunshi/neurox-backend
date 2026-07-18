import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from "@nestjs/common";

export const OrgProjectHeaders = createParamDecorator(
  (_, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    const orgId = request.headers["x-org-id"] as string | undefined;
    const projectId = request.headers["x-project-id"] as string | undefined;

    if (!orgId) {
      throw new BadRequestException("X-Org-Id header is required");
    }

    if (!projectId) {
      throw new BadRequestException("X-Project-Id header is required");
    }

    return { orgId, projectId };
  },
);
