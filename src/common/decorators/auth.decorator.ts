import { SetMetadata } from "@nestjs/common";
import { JwtTokenType } from "../types/token.type";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_TOKEN_TYPES_KEY = "allow_token_types";
export const AllowTokenTypes = (...types: JwtTokenType[]) =>
  SetMetadata(ALLOW_TOKEN_TYPES_KEY, types);
