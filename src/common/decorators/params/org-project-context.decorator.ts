import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const OrgProjectContext = createParamDecorator(
  (_, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.context;
  },
);

export type OrgProjectContextType = {
  orgId: string;
  projectId: string;
};
