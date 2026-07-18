import { PrismaService } from "@/common";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, TokenType } from "@prisma/client";
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
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.hashSecret =
      this.configService.get<string>("auth.tokenHashSecret") || "secret_key";
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

    await this.prisma.token.create({
      data: {
        userId: data.userId,
        token: data.token,
        tokenHash,
        type: data.type,
        expiresAt: data.expiresAt,
        deviceInfo: data.deviceInfo,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  /**
   * Verify if a token is valid (not revoked or expired)
   */
  async verifyToken(token: string, tokenType: TokenType): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const storedToken = await this.prisma.token.findUnique({
      where: { tokenHash, type: tokenType },
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
   * Revoke a specific token
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
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const prismaClient = tx || this.prisma;
    const tokenHash = this.hashToken(token);

    await prismaClient.token.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });

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
    const where: Prisma.TokenWhereInput = {
      userId,
      revokedAt: null,
    };

    if (excludeTokenHash) {
      where.tokenHash = { not: excludeTokenHash };
    }

    const result = await this.prisma.token.updateMany({
      where,
      data: {
        revokedAt: new Date(),
        revokedReason: reason || "All tokens revoked",
      },
    });

    this.logger.log(
      `Revoked ${result.count} tokens for user ${userId}. Reason: ${reason || "All tokens revoked"}`,
    );

    return result.count;
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(
    userId: string,
    reason?: string,
  ): Promise<number> {
    const result = await this.prisma.token.updateMany({
      where: {
        userId,
        type: TokenType.REFRESH,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason || "Refresh tokens revoked",
      },
    });

    return result.count;
  }

  /**
   * Get active tokens for a user
   */
  async getActiveTokens(userId: string, type?: TokenType) {
    const where: Prisma.TokenWhereInput = {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      deletedAt: null,
    };

    if (type) {
      where.type = type;
    }

    return this.prisma.token.findMany({
      where,
      select: {
        id: true,
        type: true,
        deviceInfo: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.token.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired tokens`);
    return result.count;
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
