import { EntityType } from "@/common/constant";
import { Activity } from "@/database/entities";
import { ContextType } from "@nestjs/common";

export interface ActivityObject {
  id: string;
  type: string;

  actor: {
    id: string;
    email?: string | null;
    profile: {
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  } | null;

  entityType: string;
  entityId: string;

  contextType: string | null;
  contextId: string | null;

  data: Activity["data"];
  createdAt: Date;
}

export interface ActivityResponse {
  id: string;
  type: string;

  actor: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;

  entityType: EntityType;
  entityId: string;

  contextType: ContextType;
  contextId: string | null;

  data: Activity["data"];
  createdAt: Date;
}
