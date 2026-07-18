export const CONTEXT_TYPES = {
  ORGANIZATION: "ORGANIZATION",
  PROJECT: "PROJECT",

  // future-proofing (you *will* need some of these)
  WORKSPACE: "WORKSPACE",
  TEAM: "TEAM",

  // optional depending on system
  USER: "USER", // personal activity
  SYSTEM: "SYSTEM", // global events
} as const;

export type ContextType = (typeof CONTEXT_TYPES)[keyof typeof CONTEXT_TYPES];
