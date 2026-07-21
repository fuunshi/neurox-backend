export * from "./activity.entity";
export * from "./app-setting.entity";
export * from "./audit-log.entity";
export * from "./login-history.entity";
export * from "./request-log.entity";
export * from "./token.entity";
export * from "./user-profile.entity";
export * from "./user.entity";

import { Activity } from "./activity.entity";
import { AppSetting } from "./app-setting.entity";
import { AuditLog } from "./audit-log.entity";
import { LoginHistory } from "./login-history.entity";
import { RequestLog } from "./request-log.entity";
import { Token } from "./token.entity";
import { UserProfile } from "./user-profile.entity";
import { User } from "./user.entity";

/** Every entity, for registration with `MikroOrmModule` / the CLI config. */
export const ENTITIES = [
  User,
  UserProfile,
  Token,
  LoginHistory,
  AuditLog,
  RequestLog,
  Activity,
  AppSetting,
];
