import { Role } from "@/common/constant/enums";
import { JwtTokenType, TokenPurpose } from "../types/token.type";

export interface JwtPayload {
  id: string;
  role: Role;

  organizationId?: string;

  type: JwtTokenType;
  purpose?: TokenPurpose;
}
