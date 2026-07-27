export * from "./activity.entity";
export * from "./app-setting.entity";
export * from "./audit-log.entity";
export * from "./deck.entity";
export * from "./flash-card.entity";
export * from "./generation-job.entity";
export * from "./login-history.entity";
export * from "./request-log.entity";
export * from "./source.entity";
export * from "./token.entity";
export * from "./user-profile.entity";
export * from "./user.entity";

import { Activity } from "./activity.entity";
import { AppSetting } from "./app-setting.entity";
import { AuditLog } from "./audit-log.entity";
import { Deck } from "./deck.entity";
import { FlashCard } from "./flash-card.entity";
import { GenerationJob } from "./generation-job.entity";
import { LoginHistory } from "./login-history.entity";
import { RequestLog } from "./request-log.entity";
import { Source } from "./source.entity";
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
  Deck,
  FlashCard,
  Source,
  GenerationJob,
];
