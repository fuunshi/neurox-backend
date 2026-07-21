import { User } from "@/database/entities";

/**
 * A `User` with its `profile` relation available. The entity already declares
 * `profile` (nullable), so this is an alias retained for the existing call
 * sites rather than a structural widening.
 */
export type UserWithProfile = User;

export type UserWithToken = User & {
  accessToken: string;
  refreshToken: string;
};
