import { SetMetadata } from "@nestjs/common";

export const ORG_OPTIONS_KEY = "org_options";

export const OrgOptions = (options: {
  requireProject?: boolean;
  allowAdminBypass?: boolean;
  researcherFlag?: boolean;
  optional?: boolean;
}) => SetMetadata(ORG_OPTIONS_KEY, options);
