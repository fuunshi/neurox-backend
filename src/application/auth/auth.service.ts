import { AUDIT_ACTION, DB_TOKEN_TYPE, Role } from "@/common/constant/enums";
import { JwtPayload } from "@/common/interfaces/jwt-payload.interface";
import { AuditService } from "@/infra/audit/audit.service";
import { EMAIL_TEMPLATES, MailQueueService } from "@/infra/mail-queue";
import { TokenService } from "@/infra/token/token.service";
import { RequestTokenType } from "@/common/types/request.type";
import {
  JwtTokenType,
  TOKEN_PURPOSE,
  TOKEN_TYPE,
  TokenPurpose,
} from "@/common/types/token.type";
import { getTokenExpiry } from "@/common/utils/token/get-token-expiry.util";
import { AuditLog, LoginHistory, Token, User } from "@/database/entities";
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { EntityManager } from "@mikro-orm/postgresql";
import * as bcrypt from "bcryptjs";
import crypto from "crypto";
import QRCode from "qrcode";
import * as speakeasy from "speakeasy";
import { UserWithProfile } from "../user/user.type";
import { ForgotPasswordDTO } from "./dto/forgot-password.dto";
import {
  AuthLoginResponseDTO,
  LoginDTO,
  LoginResponseDTO,
  LoginStep,
} from "./dto/login.dto";
import { RefreshDTO, RefreshResponseDTO } from "./dto/refresh.dto";
import { ResetPasswordDTO } from "./dto/reset-password.dto";
import { UpdatePasswordDTO } from "./dto/update-password.dto";
import { MFADTO } from "./dto/verify-mfa.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resetTokenExpiresIn: JwtSignOptions["expiresIn"];
  private readonly mfaTempTokenExpiresIn: JwtSignOptions["expiresIn"];
  private readonly jwtExpiresIn: JwtSignOptions["expiresIn"];
  private readonly refreshTokenExpiresIn: JwtSignOptions["expiresIn"];
  private readonly emailVerificationTokenExpiresIn: JwtSignOptions["expiresIn"];
  private readonly appName: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly em: EntityManager,
    private readonly mailQueueService: MailQueueService,
  ) {
    this.resetTokenExpiresIn = this.configService.getOrThrow<
      JwtSignOptions["expiresIn"]
    >("auth.passwordResetTokenExpiresIn");
    this.mfaTempTokenExpiresIn = this.configService.getOrThrow<
      JwtSignOptions["expiresIn"]
    >("auth.mfaTempTokenExpiresIn");
    this.jwtExpiresIn =
      this.configService.getOrThrow<JwtSignOptions["expiresIn"]>(
        "auth.jwtExpiresIn",
      );
    this.refreshTokenExpiresIn = this.configService.getOrThrow<
      JwtSignOptions["expiresIn"]
    >("auth.refreshTokenExpiresIn");
    this.emailVerificationTokenExpiresIn = this.configService.getOrThrow<
      JwtSignOptions["expiresIn"]
    >("auth.emailVerificationTokenExpiresIn");
    this.appName = this.configService.getOrThrow<string>("app.appName");
  }

  /**
   * @param ipAddress IP address of the user.
   * @param userAgent User agent of the user.
   * @param loginDTO Login DTO.
   * @returns LoginResponseDTO
   * @description Handles user login and returns a JWT token.
   */
  async login(
    ipAddress: string,
    userAgent: string = "unknown",
    loginDTO: LoginDTO,
  ): Promise<AuthLoginResponseDTO> {
    const user = await this.validateUser(loginDTO.email, loginDTO.password);

    const hasMfa = !!user.twoFactorSecret;
    const mfaRequired = user.twoFactorEnforced || user.twoFactorEnabled;
    const isPasswordChangeForced = user.forcePasswordChange;

    // CASE 0: When password change is forced, skip all other checks and force password update first
    if (isPasswordChangeForced) {
      return {
        step: LoginStep.UPDATE_PASSWORD,
        temporaryToken: this.generateJwt(
          {
            userId: user.id,
            role: user.role,
            tokenType: TOKEN_TYPE.TEMP,
            tokenPurpose: TOKEN_PURPOSE.UPDATE_PASSWORD,
          },
          {
            expiresIn: this.resetTokenExpiresIn,
          },
        ),
      };
    }

    // CASE 1: When MFA is not required
    if (!mfaRequired) {
      return await this.issueLoginTokens(user, ipAddress, userAgent);
    }

    // CASE 2: MFA enforced but Not setyp yet -> force setup
    if (!hasMfa) {
      return {
        step: LoginStep.MFA_SETUP_REQUIRED,
        temporaryToken: this.generateJwt(
          {
            userId: user.id,
            role: user.role,
            tokenType: TOKEN_TYPE.MFA_TEMP,
            tokenPurpose: TOKEN_PURPOSE.MFA_ENABLE,
          },
          {
            expiresIn: this.mfaTempTokenExpiresIn,
          },
        ),
      };
    }

    // CASE 3: MFA enabled
    return {
      step: LoginStep.MFA_REQUIRED,
      temporaryToken: this.generateJwt(
        {
          userId: user.id,
          role: user.role,
          tokenType: TOKEN_TYPE.MFA_TEMP,
          tokenPurpose: TOKEN_PURPOSE.MFA_VERIFY,
        },
        {
          expiresIn: this.mfaTempTokenExpiresIn,
        },
      ),
    };
  }

  /**
   * Sets up MFA for the user and returns the OTP authentication URL and base32 secret.
   * @param userId User ID.
   * @param token Temporary token issued for MFA setup, used to validate the request and ensure it's part of the MFA setup flow.
   * @returns Object containing the OTP authentication URL and base32 secret for MFA setup if successful. Otherwise, throws an appropriate error.
   */
  async setupMfa(userId: string, token: RequestTokenType) {
    if (!userId) {
      throw new UnauthorizedException("Invalid MFA setup request");
    }

    if (token.type !== TOKEN_TYPE.ACCESS) {
      if (token.purpose !== TOKEN_PURPOSE.MFA_ENABLE) {
        throw new UnauthorizedException("Invalid MFA setup request");
      }
    }

    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${userId})`,
    });

    if (!secret.otpauth_url) {
      throw new BadRequestException("Failed to generate otpauth URL");
    }

    const user = await this.em.findOneOrFail(User, { id: userId });
    this.em.assign(user, {
      twoFactorSecret: secret.base32,
    });
    await this.em.flush();

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    return {
      qrCodeDataUrl,
      manualEntryCode: secret.base32,
    };
  }

  /**
   * Enables MFA for the user after verifying the OTP code and returns login tokens.
   * @param userId User ID.
   * @param token Temporary token issued for MFA setup.
   * @param dto MFA DTO containing the OTP code.
   * @param param3 Object containing IP address and user agent for token storage and auditing.
   * @returns LoginResponseDTO with access and refresh tokens if successful. Otherwise, throws an appropriate error.
   */
  async enableMfa(
    userId: string,
    token: RequestTokenType,
    dto: MFADTO,
    { ipAddress, userAgent }: { ipAddress: string; userAgent: string },
  ): Promise<LoginResponseDTO | { message: string }> {
    if (!userId) {
      throw new UnauthorizedException("Invalid MFA setup request");
    }

    if (token.type !== TOKEN_TYPE.ACCESS) {
      if (token.purpose !== TOKEN_PURPOSE.MFA_ENABLE) {
        throw new UnauthorizedException("Invalid MFA setup request");
      }
    }

    const user = await this.em.findOne(
      User,
      { id: userId },
      { fields: ["twoFactorSecret", "twoFactorEnabled"] },
    );

    if (user?.twoFactorEnabled) {
      throw new BadRequestException("MFA is already enabled for this user");
    }
    if (!user?.twoFactorSecret) {
      throw new UnauthorizedException(
        "MFA secret not found. Please setup MFA first.",
      );
    }

    if (!this.verifyMfaOtp(user.twoFactorSecret, dto.otp)) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    const updatedUser = await this.em.findOneOrFail(
      User,
      { id: userId },
      { populate: ["profile"] },
    );
    this.em.assign(updatedUser, {
      twoFactorEnabled: true,
    });
    await this.em.flush();

    if (token.type === TOKEN_TYPE.ACCESS) {
      return {
        message: "MFA enabled successfully.",
      };
    }

    return await this.issueLoginTokens(updatedUser, ipAddress, userAgent);
  }

  /**
   * Disables MFA for the user after verifying the OTP code and revokes all existing tokens.
   * @param userId User ID.
   * @param dto MFA DTO containing the OTP code.
   * @returns A message indicating MFA has been disabled if successful. Otherwise, throws an appropriate error.
   */
  async disableMfa(userId: string, dto: MFADTO): Promise<{ message: string }> {
    const user = await this.em.findOne(
      User,
      { id: userId },
      { fields: ["twoFactorSecret", "twoFactorEnabled"] },
    );
    if (!user?.twoFactorEnabled) {
      throw new BadRequestException("MFA is not enabled for this user");
    }
    if (!user?.twoFactorSecret) {
      throw new UnauthorizedException("MFA secret not found.");
    }

    if (!this.verifyMfaOtp(user.twoFactorSecret, dto.otp)) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    const userToUpdate = await this.em.findOneOrFail(User, { id: userId });
    this.em.assign(userToUpdate, {
      twoFactorEnabled: false,
    });
    await this.em.flush();

    await this.revokeAllTokens(
      userId,
      userId,
      "MFA disabled - revoke all tokens",
    );

    return {
      message: "MFA disabled successfully.",
    };
  }

  /**
   * @param ipAddress Client IP address.
   * @param userAgent User agent of the user.
   * @param dto VerifyMFADTO
   * @returns LoginResponseDTO
   * @description Verifies the MFA code and returns the user and JWT token.
   */
  async verifyMfaCode(
    userId: string,
    token: RequestTokenType,
    dto: MFADTO,
    { ipAddress, userAgent }: { ipAddress: string; userAgent: string },
  ): Promise<LoginResponseDTO> {
    if (!userId) {
      throw new UnauthorizedException("Invalid MFA verification request");
    }

    if (token.purpose !== TOKEN_PURPOSE.MFA_VERIFY) {
      throw new UnauthorizedException("Invalid MFA verification request");
    }

    const user = await this.em.findOne(
      User,
      { id: userId },
      { populate: ["profile"] },
    );

    if (!user?.twoFactorSecret) {
      throw new UnauthorizedException(
        "MFA secret not found. Please setup MFA first.",
      );
    }

    const isValidMfaCode = this.verifyMfaOtp(user.twoFactorSecret, dto.otp);

    if (!isValidMfaCode) {
      throw new UnauthorizedException("Invalid MFA code");
    }

    return this.issueLoginTokens(user, ipAddress, userAgent);
  }

  /**
   * @param userId User ID.
   * @param userAgent User agent of the user.
   * @returns void
   * @description Handles user logout.
   */
  async logout(userId: string, userAgent: string = "undefined"): Promise<void> {
    // Revoke all tokens for this user
    await this.tokenService.revokeAllUserTokens(userId, "User logout");

    await this.em.nativeUpdate(
      LoginHistory,
      {
        user: userId,
        userAgent,
        logoutAt: null,
      },
      { logoutAt: new Date() },
    );

    // Audit log
    await this.auditService.log({
      userId,
      performedById: userId,
      action: AUDIT_ACTION.LOGOUT,
      entityType: "User",
      entityId: userId,
      userAgent,
    });
  }

  /**
   * Initiates the forgot password flow for a user
   *
   * If email exists, generates a secure time-limited password reset token
   * store its hash and triggers delivery of reset
   *
   * Always returns a generic response regardless of wether email exists or not
   * to prevent email enumeration attacks
   *
   * @param forgotPasswordDTO contains the user Email address
   * @param ipAddress ip address of request origin source (for auditing)
   * @param userAgent optional user agent string for device logging
   * @returns A generic success message
   *
   */
  async forgotPassword(
    forgotPasswordDTO: ForgotPasswordDTO,
    ipAddress: string,
    userAgent: string = "undefined",
  ): Promise<{ message: string }> {
    const user = await this.em.findOne(User, {
      email: forgotPasswordDTO.email,
    });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = getTokenExpiry(this.resetTokenExpiresIn);
    if (user) {
      await this.tokenService.storeToken({
        userId: user.id,
        token: rawToken,
        type: DB_TOKEN_TYPE.PASSWORD_RESET,
        expiresAt,
        ipAddress,
        userAgent,
      });

      await this.mailQueueService.enqueueEmail({
        to: user.email,
        template: EMAIL_TEMPLATES.PASSWORD_RESET,
        payload: {
          token: rawToken,
        },
        retryAttempt: 2,
      });
    }
    return {
      message:
        "An email has been sent if the email address exists in our system with instructions to reset your password",
    };
  }

  /**
   *
   * Start reset password flow
   *
   * Verifies token and gets associated user if the given token is valid
   * Then hashes new password and updates user record and
   * revokes the reset token
   *
   * @param resetPasswordDTO contains the new password and the reset token.
   * @returns A message indicating password reset success.
   *
   */
  async resetPassword(
    resetPasswordDTO: ResetPasswordDTO,
  ): Promise<{ message: string }> {
    const hashToken = this.tokenService.hashToken(resetPasswordDTO.token);
    const token = await this.em.transactional(async (tx) => {
      return await tx.findOne(
        Token,
        { tokenHash: hashToken, type: DB_TOKEN_TYPE.PASSWORD_RESET },
        {
          fields: ["revokedAt", "expiresAt", "user.id"],
        },
      );
    });
    if (!token) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (token.revokedAt) {
      throw new UnauthorizedException("Token has been revoked");
    }
    if (token.expiresAt < new Date()) {
      throw new UnauthorizedException("Token has expired");
    }
    const hashedPassword = await bcrypt.hash(resetPasswordDTO.newPassword, 10);
    await this.em.transactional(async (tx) => {
      const user = await tx.findOneOrFail(User, { id: token.user.id });
      tx.assign(user, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      });
      await tx.flush();
      await this.tokenService.revokeToken({
        token: resetPasswordDTO.token,
        reason: "Password reset",
        tx,
      });
    });
    return { message: "Password reset successful" };
  }

  async updatePassword(
    id: string,
    updatePasswordDTO: UpdatePasswordDTO,
    token: RequestTokenType,
  ): Promise<{ message: string }> {
    if (token.type === TOKEN_TYPE.TEMP) {
      if (token.purpose !== TOKEN_PURPOSE.UPDATE_PASSWORD) {
        throw new UnauthorizedException("Invalid token purpose");
      }
    }

    const { currentPassword, newPassword, newConfirmationPassword } =
      updatePasswordDTO;

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "New password must be different from current password",
      );
    }

    if (newPassword !== newConfirmationPassword) {
      throw new BadRequestException(
        "New password and confirmation do not match",
      );
    }

    const user = await this.em.findOne(
      User,
      { id },
      {
        fields: ["id", "password"],
      },
    );

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const isPasswordValid = await this.comparePassword(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.em.transactional(async (tx) => {
      const user = await tx.findOneOrFail(User, { id });
      tx.assign(user, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        forcePasswordChange: false,
      });
      await tx.flush();

      tx.create(AuditLog, {
        user: tx.getReference(User, id),
        performedBy: tx.getReference(User, id),
        action: AUDIT_ACTION.PASSWORD_CHANGE,
        entityType: "User",
        entityId: id,
      });
      await tx.flush();
    });

    // Revoke all existing tokens after password change
    await this.tokenService.revokeAllUserTokens(id, "Password updated");

    return { message: "Password updated successfully" };
  }

  /**
   * Revoke all tokens for a user (force logout from all devices)
   */
  async revokeAllTokens(
    userId: string,
    performedById: string,
    reason?: string,
  ): Promise<number> {
    const count = await this.tokenService.revokeAllUserTokens(userId, reason);

    // Audit log
    await this.auditService.log({
      userId,
      performedById,
      action: AUDIT_ACTION.TOKEN_REVOKE,
      entityType: "Token",
      metadata: { reason, revokedCount: count },
    });

    return count;
  }

  async refreshLoginToken(
    refreshDTO: RefreshDTO,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RefreshResponseDTO> {
    const { refreshToken } = refreshDTO;

    // Check if token is revoked
    const isValid = await this.tokenService.verifyToken(
      refreshToken,
      DB_TOKEN_TYPE.REFRESH,
    );
    if (!isValid) {
      throw new UnauthorizedException("Token has been revoked");
    }

    const decoded: unknown = this.jwtService.decode(refreshToken);
    if (!decoded) throw new UnauthorizedException("Invalid refresh token");
    if (typeof decoded !== "object" || decoded === null || !("id" in decoded)) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const userId = decoded.id;
    if (typeof userId !== "string") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.em.findOne(User, {
      id: userId,
      deletedAt: null,
    });
    if (!user) throw new UnauthorizedException("Invalid refresh token");

    // Revoke old refresh token
    await this.tokenService.revokeToken({
      token: refreshToken,
      reason: "Token refreshed",
    });

    const newAccessToken = this.generateJwt(
      {
        userId: user.id,
        role: user.role,
        tokenType: TOKEN_TYPE.ACCESS,
      },
      {
        expiresIn: this.jwtExpiresIn,
      },
    );
    const newRefreshToken = this.generateRefreshJwt(user.id);

    // Store new tokens
    const accessExpiry = getTokenExpiry(this.jwtExpiresIn);
    const refreshExpiry = getTokenExpiry(this.refreshTokenExpiresIn);

    await Promise.all([
      this.tokenService.storeToken({
        userId: user.id,
        token: newAccessToken,
        type: DB_TOKEN_TYPE.ACCESS,
        expiresAt: accessExpiry,
        ipAddress,
        userAgent,
      }),
      this.tokenService.storeToken({
        userId: user.id,
        token: newRefreshToken,
        type: DB_TOKEN_TYPE.REFRESH,
        expiresAt: refreshExpiry,
        ipAddress,
        userAgent,
      }),
    ]);

    return RefreshResponseDTO.fromEntity({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  }

  /**
   * Validates user credentials and returns the user if valid.
   * @param email User email.
   * @param password User password.
   * @returns User with Profile
   */
  async validateUser(
    email: string,
    password: string,
  ): Promise<UserWithProfile> {
    const user = await this.em.findOne(
      User,
      { email },
      { populate: ["profile"] },
    );
    if (!user) throw new UnauthorizedException("Invalid credentials");

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // remove this in prod
      throw new UnauthorizedException(
        `Account is temporarily locked due to too many failed login attempts. Locked Until: ${user.lockedUntil.toISOString()}`,
      );
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.incrementFailedLoginAttempts(user.id);
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }

    // Check if user email is verified
    if (!user.emailVerified) {
      await this.resendEmailVerificationIfExpired(user.id, user.email);

      throw new UnauthorizedException(
        "Please verify your email before logging in.",
      );
    }

    return user;
  }

  /**
   * Update last login info. Inlined from the deleted `UserRepository`; failures
   * are logged rather than thrown so they cannot break the login response.
   * @param id User ID
   * @param ipAddress IP Address
   */
  private async updateLastLogin(id: string, ipAddress?: string): Promise<void> {
    try {
      const user = await this.em.findOne(User, { id });
      if (!user) return;

      this.em.assign(user, {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
      await this.em.flush();
    } catch (error: unknown) {
      this.logger.error(`Error updating last login: ${String(error)}`);
    }
  }

  /**
   * Increment failed login attempts. Inlined from the deleted `UserRepository`;
   * failures are logged rather than thrown.
   * @param id User ID
   */
  private async incrementFailedLoginAttempts(id: string): Promise<void> {
    try {
      const user = await this.em.findOne(User, { id });
      if (!user) return;

      const newAttempts = user.failedLoginAttempts + 1;
      const changes: { failedLoginAttempts: number; lockedUntil?: Date } = {
        failedLoginAttempts: newAttempts,
      };

      // Lock account after 5 failed attempts for 15 minutes
      if (newAttempts >= 5) {
        changes.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      this.em.assign(user, changes);
      await this.em.flush();
    } catch (error: unknown) {
      this.logger.error(
        `Error incrementing failed login attempts: ${String(error)}`,
      );
    }
  }

  /**
   * Verifies a user's email address using a verification token.
   * Validates that the token exists, has not expired, and has not been revoked.
   * When valid, marks the user's email as verified and revokes the token so it
   * cannot be reused.
   * @param token Email verification token from the verification link.
   * @returns A success message when the email is verified.
   */

  async verifyEmail(token: string): Promise<{ message: string }> {
    const now = new Date();

    if (!token) {
      throw new BadRequestException("Verification token is required");
    }

    const tokenHash = this.tokenService.hashToken(token);

    const storedToken = await this.em.findOne(
      Token,
      {
        tokenHash,
        type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
      },
      {
        populate: ["user"],
        fields: ["revokedAt", "expiresAt", "user.id", "user.emailVerified"],
      },
    );

    if (!storedToken) {
      throw new BadRequestException("Invalid verification token");
    }

    // The global soft-delete filter applies to the populated `user` relation,
    // so a token whose owner has since been deleted comes back with a null
    // user rather than throwing a TypeError further down.
    if (!storedToken.user) {
      throw new BadRequestException("Invalid verification token");
    }

    if (storedToken.revokedAt) {
      throw new BadRequestException("Token is no longer valid");
    }

    if (storedToken.expiresAt < now) {
      throw new BadRequestException("Verification token has expired");
    }

    if (storedToken.user.emailVerified) {
      await this.em.nativeUpdate(
        Token,
        {
          user: storedToken.user.id,
          type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
          revokedAt: null,
        },
        {
          revokedAt: now,
          revokedReason: "Email already verified",
        },
      );

      return { message: "Email is already verified" };
    }

    await this.em.transactional(async (tx) => {
      const user = await tx.findOneOrFail(User, { id: storedToken.user.id });
      tx.assign(user, {
        emailVerified: true,
        emailVerifiedAt: now,
      });
      await tx.flush();

      await tx.nativeUpdate(
        Token,
        {
          user: storedToken.user.id,
          type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
          revokedAt: null,
        },
        {
          revokedAt: now,
          revokedReason: "Email verified",
        },
      );
    });

    return { message: "Email verified successfully" };
  }

  async getAuthDetails(id: string) {
    const user = await this.em.findOne(
      User,
      { id },
      {
        fields: [
          "id",
          "email",
          "role",
          "twoFactorEnabled",
          "lastLoginAt",
          "passwordChangedAt",
          "forcePasswordChange",
          "isActive",
        ],
      },
    );

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      forcePasswordChange: user.forcePasswordChange,
      isActive: user.isActive,
    };
  }

  /**
   * Compares a plain-text password with a hashed password.
   * @param plainText Plain-text password.
   * @param hashed Hashed password.
   * @returns Promise<boolean>
   */
  private async comparePassword(
    plainText: string,
    hashed: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainText, hashed);
  }

  /**
   * Generates a JWT token for the user.
   * @param userId ID of user
   * @param role User role
   * @returns string
   */
  private generateJwt(
    {
      userId,
      role,
      tokenType,
      tokenPurpose,
    }: {
      userId: string;
      role: Role;
      tokenType: JwtTokenType;
      tokenPurpose?: TokenPurpose;
    },
    options: JwtSignOptions,
  ): string {
    const payload: JwtPayload = {
      id: userId,
      role,
      type: tokenType,
      purpose: tokenPurpose ?? undefined,
    };
    return this.jwtService.sign(payload, options);
  }

  /**
   * Generates a refresh JWT token for the user.
   * @param userId ID of user
   * @returns string
   */
  private generateRefreshJwt(userId: string): string {
    return this.jwtService.sign(
      { id: userId, type: TOKEN_TYPE.REFRESH },
      {
        expiresIn: this.refreshTokenExpiresIn,
      },
    );
  }

  private verifyMfaOtp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 1,
    });
  }

  private async resendEmailVerificationIfExpired(
    userId: string,
    email: string,
  ): Promise<void> {
    const now = new Date();

    const currentToken = await this.em.findOne(
      Token,
      {
        user: userId,
        type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
        revokedAt: null,
        deletedAt: null,
      },
      {
        orderBy: {
          expiresAt: "desc",
        },
        fields: ["expiresAt"],
      },
    );

    if (currentToken && currentToken.expiresAt > now) {
      return;
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = getTokenExpiry(this.emailVerificationTokenExpiresIn);

    await this.em.transactional(async (tx) => {
      await tx.nativeUpdate(
        Token,
        {
          user: userId,
          type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
          revokedAt: null,
          expiresAt: {
            $lte: now,
          },
        },
        {
          revokedAt: now,
          revokedReason: "Email verification token expired",
        },
      );

      tx.create(Token, {
        user: tx.getReference(User, userId),
        token: verificationToken,
        tokenHash: this.tokenService.hashToken(verificationToken),
        type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
        expiresAt,
      });
      await tx.flush();
    });

    await this.mailQueueService.enqueueEmail({
      to: email,
      template: EMAIL_TEMPLATES.VERIFY_EMAIL,
      payload: {
        token: verificationToken,
      },
      retryAttempt: 1,
    });
  }

  private async issueLoginTokens(
    user: UserWithProfile,
    ipAddress: string,
    userAgent: string = "undefined",
  ): Promise<LoginResponseDTO> {
    // Update last login info
    await this.updateLastLogin(user.id, ipAddress);

    const accessToken = this.generateJwt(
      {
        userId: user.id,
        role: user.role,
        tokenType: TOKEN_TYPE.ACCESS,
      },
      {
        expiresIn: this.jwtExpiresIn,
      },
    );

    const refreshToken = this.generateRefreshJwt(user.id);

    const accessExpiry = getTokenExpiry(this.jwtExpiresIn);

    const refreshExpiry = getTokenExpiry(this.refreshTokenExpiresIn);

    await Promise.all([
      this.tokenService.storeToken({
        userId: user.id,
        token: accessToken,
        type: DB_TOKEN_TYPE.ACCESS,
        expiresAt: accessExpiry,
        ipAddress,
        userAgent,
      }),
      this.tokenService.storeToken({
        userId: user.id,
        token: refreshToken,
        type: DB_TOKEN_TYPE.REFRESH,
        expiresAt: refreshExpiry,
        ipAddress,
        userAgent,
      }),
    ]);

    // Keep login-history persistence non-blocking to avoid impacting auth response latency.
    this.em.create(LoginHistory, {
      user: this.em.getReference(User, user.id),
      ipAddress,
      userAgent,
    });
    void this.em.flush().catch((error) => {
      this.logger.error(`Error logging login history: ${error}`);
    });

    // Audit log
    await this.auditService.log({
      userId: user.id,
      performedById: user.id,
      action: AUDIT_ACTION.LOGIN,
      entityType: "User",
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return LoginResponseDTO.fromEntity({
      ...user,
      accessToken,
      refreshToken,
    });
  }
}
