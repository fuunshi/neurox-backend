import { User, UserProfile } from "@prisma/client";

export type UserWithProfile = User & {
  profile: UserProfile | null;
};

export type UserWithToken = UserWithProfile & {
  accessToken: string;
  refreshToken: string;
};
