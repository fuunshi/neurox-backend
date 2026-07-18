import { PrismaService } from "@/common";
import { ACTIVITY_TYPES, CONTEXT_TYPES, ENTITY_TYPES } from "@/common/constant";
import { AuditService } from "@/common/modules/audit/audit.service";
import { EMAIL_TEMPLATES, MailQueueService } from "@/common/modules/mail-queue";
import { TokenService } from "@/common/modules/token/token.service";
import { handleError } from "@/common/utils/error/handler/generic.handler";
import { getTokenExpiry } from "@/common/utils/token/get-token-expiry.util";
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
import {
  AuditAction,
  TokenType,
  UserProfile,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { RegisterDTO, RegisterResponseDTO } from "./dto/register.dto";
import { UpdateUserProfileDTO } from "./dto/update-user-profile.dto";
import { UserRepository } from "./user.repository";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly emailVerificationTokenTimer: JwtSignOptions["expiresIn"];
  private readonly frontendUrl: string;
  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly mailQueueService: MailQueueService,
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
    // Check if the email already exists
    const existingUser = await this.userRepository.findByEmail(
      registerDTO.email,
    );

    if (existingUser) {
      throw new ConflictException("Email already in use.");
    }

    const username = registerDTO.username.toLowerCase();

    // Check if the username already exists
    const existingUsername = await this.prisma.user.findUnique({
      where: {
        username,
      },
      select: {
        id: true,
      },
    });

    if (existingUsername) {
      throw new ConflictException("Username already in use.");
    }

    // Check if phone number already exists (if provided)
    if (registerDTO.phoneNumber) {
      const existingPhone = await this.userRepository.findByPhoneNumber(
        registerDTO.phoneNumber,
      );

      if (existingPhone) {
        throw new ConflictException("Phone number already in use.");
      }
    }

    const hashedPassword = await bcrypt.hash(registerDTO.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: registerDTO.email,
          username: username,
          password: hashedPassword,
          profile: {
            create: {
              firstName: registerDTO.firstName,
              lastName: registerDTO.lastName,
              phoneNumber: registerDTO.phoneNumber,
            },
          },
        },
        include: {
          profile: true,
        },
      });
      // Handle user creation failure
      if (!user) {
        this.logger.error("Error during user creation in service.");
        throw new InternalServerErrorException(
          "Error during user creation in service.",
        );
      }

      await this.auditService.log(
        {
          userId: user.id,
          performedById: user.id, // Self-registration
          action: AuditAction.CREATE,
          entityType: "User",
          entityId: user.id,
          newValues: {
            email: user.email,
            role: user.role,
            status: user.status,
          },
        },
        tx,
      );

      return user;
    });

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = getTokenExpiry(this.emailVerificationTokenTimer);

    // Store token
    await this.tokenService.storeToken({
      userId: user.id,
      token: verificationToken,
      type: TokenType.EMAIL_VERIFICATION,
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        forcePasswordChange: true,
        lastLoginAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            country: true,
            city: true,
            timezone: true,
            language: true,
            currency: true,
          },
        },
      },
    });
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
    return this.prisma.userProfile.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        ...data,
      },
      update: {
        ...data,
      },
    });
  }

  async getUserDetails(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        isActive: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phoneNumber: true,
            displayName: true,
            state: true,
            address: true,
            postalCode: true,
            country: true,
            city: true,
            timezone: true,
            language: true,
            currency: true,
            avatar: true,
            bio: true,
            dateOfBirth: true,
            website: true,
            socialLinks: true,
            preferences: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    return user;
  }
}
