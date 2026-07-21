/** Backed by the native Postgres enum `role`. */
export const ROLE = {
  USER: "USER",
  RESEARCHER: "RESEARCHER",
  ADMIN: "ADMIN",
  MODERATOR: "MODERATOR",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];
