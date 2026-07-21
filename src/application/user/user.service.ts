import { AccountLifecycleService } from "@/application/account/account-lifecycle.service";
import { ACTIVITY_TYPES, CONTEXT_TYPES, ENTITY_TYPES } from "@/common/constant";
import { ACCOUNT_ERROR_CODES } from "@/common/constant/account.constant";
import { AUDIT_ACTION, DB_TOKEN_TYPE } from "@/common/constant/enums";
import { AuditService } from "@/infra/audit/audit.service";
import { EMAIL_TEMPLATES, MailQueueService } from "@/infra/mail-queue";
import { TokenService } from "@/infra/token/token.service";
import { handleError } from "@/common/utils/error/handler/generic.handler";
import { getTokenExpiry } from "@/common/utils/token/get-token-expiry.util";
import { User, UserProfile } from "@/database/entities";
import { EntityManager } from "@mikro-orm/postgresql";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { RegisterDTO, RegisterResponseDTO } from "./dto/register.dto";
import { UpdateUserProfileDTO } from "./dto/update-user-profile.dto";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly emailVerificationTokenTimer: JwtSignOptions["expiresIn"];
  private readonly frontendUrl: string;
  constructor(
    private readonly auditService: AuditService,
    private readonly em: EntityManager,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly mailQueueService: MailQueueService,
    private readonly accountLifecycle: AccountLifecycleService,
  ) {
    this.emailVerificationTokenTimer = this.configService.getOrThrow<
      JwtSignOptions["expiresIn"]
    >("auth.emailVerificationTokenExpiresIn");

    this.frontendUrl = this.configService.getOrThrow<string>(
      "app.frontendBaseUrl",
    );
  }

  /**
   * @param registerDTO Contains the Register Information like name, email, password and so on
   * Handles user registration and returns user information.
   */
  async register(registerDTO: RegisterDTO): Promise<RegisterResponseDTO> {
    // Check if the email already exists. The global soft-delete filter means
    // this deliberately does not match soft-deleted accounts.
    const existingUser = await this.em.findOne(
      User,
      { email: registerDTO.email },
      { populate: ["profile"] },
    );

    if (existingUser) {
      throw new ConflictException("Email already in use.");
    }

    // No active account holds this address. If a soft-deleted one does and is
    // still inside its grace period, offer recovery instead of leaving the
    // caller at a dead end -- the address is not actually available yet.
    const recoverableUntil = await this.accountLifecycle.recoveryDeadline(
      registerDTO.email,
    );

    if (recoverableUntil) {
      throw new ConflictException({
        message:
          "An account with this email was recently deleted and can still be recovered.",
        code: ACCOUNT_ERROR_CODES.ACCOUNT_RECOVERABLE,
        recoverableUntil: recoverableUntil.toISOString(),
      });
    }

    const username = registerDTO.username.toLowerCase();

    // Check if the username already exists
    const existingUsername = await this.em.findOne(
      User,
      { username },
      { fields: ["id"] },
    );

    if (existingUsername) {
      throw new ConflictException("Username already in use.");
    }

    // Check if phone number already exists (if provided)
    if (registerDTO.phoneNumber) {
      const existingPhone = await this.em.findOne(
        User,
        { profile: { phoneNumber: registerDTO.phoneNumber } },
        { populate: ["profile"] },
      );

      if (existingPhone) {
        throw new ConflictException("Phone number already in use.");
      }
    }

    const hashedPassword = await bcrypt.hash(registerDTO.password, 10);

    const user = await this.em.transactional(async (tx) => {
      // MikroORM has no nested writes, so the profile is created alongside the
      // user and linked through the owning side (`UserProfile.user`).
      const created = tx.create(User, {
        email: registerDTO.email,
        username,
        password: hashedPassword,
      });

      const profile = tx.create(UserProfile, {
        firstName: registerDTO.firstName,
        lastName: registerDTO.lastName ?? null,
        phoneNumber: registerDTO.phoneNumber ?? null,
        user: created,
      });
      created.profile = profile;

      await tx.flush();

      await this.auditService.log(
        {
          userId: created.id,
          performedById: created.id, // Self-registration
          action: AUDIT_ACTION.CREATE,
          entityType: "User",
          entityId: created.id,
          newValues: {
            email: created.email,
            role: created.role,
            status: created.status,
          },
        },
        tx,
      );
      await tx.flush();

      return created;
    });

    if (!user) {
      this.logger.error("Error during user creation in service.");
      throw new InternalServerErrorException(
        "Error during user creation in service.",
      );
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = getTokenExpiry(this.emailVerificationTokenTimer);

    // Store token
    await this.tokenService.storeToken({
      userId: user.id,
      token: verificationToken,
      type: DB_TOKEN_TYPE.EMAIL_VERIFICATION,
      expiresAt,
    });

    await this.mailQueueService.enqueueEmail({
      to: user.email,
      template: EMAIL_TEMPLATES.VERIFY_EMAIL,
      payload: {
        token: verificationToken,
      },
      retryAttempt: 1,
    });

    // Prepare and return the response DTO
    return RegisterResponseDTO.fromEntity(user);
  }

  async metadata(userId: string) {
    const user = await this.em.findOne(
      User,
      { id: userId },
      {
        populate: ["profile"],
        fields: [
          "id",
          "email",
          "role",
          "status",
          "isActive",
          "forcePasswordChange",
          "lastLoginAt",
          "profile.firstName",
          "profile.lastName",
          "profile.phoneNumber",
          "profile.country",
          "profile.city",
          "profile.timezone",
          "profile.language",
          "profile.currency",
        ],
      },
    );
    if (!user) {
      throw new BadRequestException("User not found.");
    }

    const profileCompleteStatus = [
      user.profile?.firstName,
      user.profile?.lastName,
      user.profile?.phoneNumber,
      user.profile?.country,
      user.profile?.city,
      user.profile?.timezone,
      user.profile?.language,
      user.profile?.currency,
    ].every((field) => typeof field === "string" && field.trim().length > 0);

    const response = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
      lastLoginAt: user.lastLoginAt,
      profileCompleteStatus,
    };
    return response;
  }

  /**
   * This method updates user's profile information
   * @param userId Contains userId collected from the request object
   * @param data UpdateProfileDTO containing the fields like firstname, lastname, avatar, bio, etc that can be updated in user profile
   * @returns updated profile information of the user
   */
  async updateUserProfile(
    userId: string,
    data: UpdateUserProfileDTO,
  ): Promise<UserProfile> {
    const existing = await this.em.findOne(UserProfile, { user: userId });

    if (existing) {
      this.em.assign(existing, data);
      await this.em.flush();
      return existing;
    }

    const profile = this.em.create(UserProfile, {
      user: this.em.getReference(User, userId),
      ...data,
    });
    await this.em.flush();
    return profile;
  }

  async getUserDetails(userId: string): Promise<any> {
    const user = await this.em.findOne(
      User,
      { id: userId },
      {
        populate: ["profile"],
        // Explicit field list, as the Prisma `select` did: returning the whole
        // entity would leak `password` and every other column.
        fields: [
          "id",
          "email",
          "role",
          "status",
          "isActive",
          "profile.firstName",
          "profile.lastName",
          "profile.phoneNumber",
          "profile.displayName",
          "profile.state",
          "profile.address",
          "profile.postalCode",
          "profile.country",
          "profile.city",
          "profile.timezone",
          "profile.language",
          "profile.currency",
          "profile.avatar",
          "profile.bio",
          "profile.dateOfBirth",
          "profile.website",
          "profile.socialLinks",
          "profile.preferences",
        ],
      },
    );

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return user;
  }
}
