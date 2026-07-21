import { FastifyRequest } from "fastify";

import { Role } from "@/common/constant/enums";
import { JwtTokenType, TokenPurpose } from "./token.type";

// ─────────────────────────────────────────────
// Core Identity Types
// ─────────────────────────────────────────────

export type RequestUserType = {
  id: string;
  role: Role;
};

export type RequestTokenType = {
  type: JwtTokenType;
  value: string;
  purpose?: TokenPurpose;
};

// ─────────────────────────────────────────────
// Context Fragments
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Base Auth Context (after AuthGuard)
// ─────────────────────────────────────────────

export type AuthContextBase = {
  user: RequestUserType;
  token: RequestTokenType;
};

// ─────────────────────────────────────────────
// Scoped Context Variants
// ─────────────────────────────────────────────

// After AuthGuard
export type AuthenticatedContext = AuthContextBase;

// ─────────────────────────────────────────────
// Request Types
// ─────────────────────────────────────────────

// After AuthGuard
export type AuthenticatedRequest = FastifyRequest & {
  authContext: AuthenticatedContext;
};
