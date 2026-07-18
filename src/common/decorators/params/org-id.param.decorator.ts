import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from "@nestjs/common";

export const OrgIdHeaders = createParamDecorator((_, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();

  const orgId: string | undefined = request.headers["x-org-id"];

  if (!orgId) {
    throw new BadRequestException("X-Org-Id header is required");
  }

  return { orgId };
});
