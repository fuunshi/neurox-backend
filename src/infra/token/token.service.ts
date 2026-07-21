import { DB_TOKEN_TYPE, TokenType } from "@/common/constant/enums";
import { Token, User } from "@/database/entities";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHmac } from "crypto";

export interface CreateTokenData {
  userId: string;
  token: string;
  type: TokenType;
  expiresAt: Date;
  deviceInfo?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly hashSecret: string;

  constructor(
    private readonly em: EntityManager,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Required, not defaulted. A silent fallback here means every token hash is
    // computed with a publicly-known key, and because `verifyToken` returns
    // true when no row matches, revocation would quietly stop working.
    this.hashSecret = this.configService.getOrThrow<string>(
      "auth.tokenHashSecret",
    );
  }

  /**
   * Hash a token for secure storage and lookup
   */
  public hashToken(token: string): string {
    return createHmac("sha256", this.hashSecret).update(token).digest("hex");
  }

  /**
   * Store a token in the database
   */
  async storeToken(data: CreateTokenData): Promise<void> {
    const tokenHash = this.hashToken(data.token);

    this.em.create(Token, {
      user: this.em.getReference(User, data.userId),
      token: data.token,
      tokenHash,
      type: data.type,
      expiresAt: data.expiresAt,
      deviceInfo: data.deviceInfo,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
    });

    await this.em.flush();
  }

  /**
   * Verify if a token is valid (not revoked or expired)
   */
  async verifyToken(token: string, tokenType: TokenType): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const storedToken = await this.em.findOne(Token, {
      tokenHash,
      type: tokenType,
    });

    if (!storedToken) {
      return true; // Token not in database, might be an old token - let JWT validation handle it
    }

    // Check if token is revoked
    if (storedToken.revokedAt) {
      return false;
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * Revoke a specific token.
   *
   * Pass `tx` when calling inside `em.transactional()` so the revocation joins
   * that transaction and rolls back with it.
   */
  async revokeToken({
    token,
    reason,
    performedById,
    tx,
  }: {
    token: string;
    reason?: string;
    performedById?: string;
    tx?: EntityManager;
  }): Promise<void> {
    const em = tx ?? this.em;
    const tokenHash = this.hashToken(token);

    await em.nativeUpdate(
      Token,
      {
        tokenHash,
        revokedAt: null,
      },
      {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );

    this.logger.log(`Token revoked. Reason: ${reason || "No reason provided"}`);
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(
    userId: string,
    reason?: string,
    excludeTokenHash?: string,
  ): Promise<number> {
    const where: FilterQuery<Token> = {
      user: userId,
      revokedAt: null,
    };

    if (excludeTokenHash) {
      where.tokenHash = { $ne: excludeTokenHash };
    }

    const count = await this.em.nativeUpdate(Token, where, {
      revokedAt: new Date(),
      revokedReason: reason || "All tokens revoked",
    });

    this.logger.log(
      `Revoked ${count} tokens for user ${userId}. Reason: ${reason || "All tokens revoked"}`,
    );

    return count;
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(
    userId: string,
    reason?: string,
  ): Promise<number> {
    const count = await this.em.nativeUpdate(
      Token,
      {
        user: userId,
        type: DB_TOKEN_TYPE.REFRESH,
        revokedAt: null,
      },
      {
        revokedAt: new Date(),
        revokedReason: reason || "Refresh tokens revoked",
      },
    );

    return count;
  }

  /**
   * Get active tokens for a user
   */
  async getActiveTokens(userId: string, type?: TokenType) {
    const where: FilterQuery<Token> = {
      user: userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      deletedAt: null,
    };

    if (type) {
      where.type = type;
    }

    return this.em.find(Token, where, {
      fields: [
        "id",
        "type",
        "deviceInfo",
        "ipAddress",
        "userAgent",
        "createdAt",
        "expiresAt",
      ],
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const count = await this.em.nativeUpdate(
      Token,
      {
        expiresAt: { $lt: new Date() },
        deletedAt: null,
      },
      {
        deletedAt: new Date(),
      },
    );

    this.logger.log(`Cleaned up ${count} expired tokens`);
    return count;
  }

  /**
   * Generate access token
   */
  generateAccessToken(userId: string, role: string): string {
    return this.jwtService.sign(
      { userId, role },
      {
        expiresIn: (this.configService.get<string>("auth.jwtExpiresIn") ||
          "1d") as `${number}${"s" | "m" | "h" | "d"}`,
      },
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(userId: string): string {
    return this.jwtService.sign(
      { userId, type: "refresh" },
      {
        expiresIn: (this.configService.get<string>(
          "auth.refreshTokenExpiresIn",
        ) || "7d") as `${number}${"s" | "m" | "h" | "d"}`,
      },
    );
  }

  /**
   * Decode token without verification
   */
  decodeToken(token: string): Record<string, unknown> | null {
    try {
      return this.jwtService.decode(token);
    } catch {
      return null;
    }
  }
}
