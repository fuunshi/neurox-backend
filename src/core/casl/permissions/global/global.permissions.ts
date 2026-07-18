import { Role } from "@prisma/client";
import { Action } from "../../actions.enum";

export function applyGlobalPermissions(user, can) {
  switch (user.role) {
    case Role.SUPER_ADMIN:
      can(Action.Manage, "all");
      break;

    case Role.ADMIN:
      can(Action.Read, "Organization");
      can(Action.Read, "User");
      break;

    case Role.MODERATOR:
      can(Action.Review, "Report");
      break;
  }
}
