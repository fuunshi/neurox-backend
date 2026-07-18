import { RequestUserType } from "@/common/types/request.type";
import { AppAbility } from "./app-ability.interface";

export interface AuthContext {
  user: RequestUserType;

  organizationMembership?: any;

  projectAssignments?: any[];

  ability: AppAbility;
}
