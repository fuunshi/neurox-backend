import { Injectable, Logger } from "@nestjs/common";
import { User, UserProfile, Prisma } from "@prisma/client";
import { PrismaService } from "@/common/modules/prisma/prisma.service";
import { handlePrismaError } from "@/common/utils/error/handler/prisma.handler";

export type UserWithProfile = User & { profile: UserProfile | null };

@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gets the user by ID with profile.
   * @param id User ID
   * @returns User with Profile
   */
  async findById(id: string): Promise<UserWithProfile | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id, deletedAt: null },
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error finding user by ID: ${String(error)}`);
    }
  }

  /**
   * Gets User by Email with profile
   * @param email Email to find the user
   * @returns User with Profile
   */
  async findByEmail(email: string): Promise<UserWithProfile | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email, deletedAt: null },
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error finding user by email: ${String(error)}`);
    }
  }

  /**
   * Get User by Phone Number
   * @param phoneNumber Unique Phone number to fetch user from
   * @returns User with Profile
   */
  async findByPhoneNumber(
    phoneNumber: string,
  ): Promise<UserWithProfile | null> {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          profile: { phoneNumber, deletedAt: null },
          deletedAt: null,
        },
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error finding user by phone number: ${String(error)}`);
    }
  }

  /**
   * Creates user with profile in the database
   * @param data User and profile data
   * @returns User with Profile
   */
  async createUser(data: {
    firstName: string;
    lastName?: string;
    email: string;
    username: string;
    password: string;
    phoneNumber?: string;
  }): Promise<UserWithProfile | null> {
    try {
      return await this.prisma.user.create({
        data: {
          email: data.email,
          username: data.username,
          password: data.password,
          profile: {
            create: {
              firstName: data.firstName,
              lastName: data.lastName,
              phoneNumber: data.phoneNumber,
            },
          },
        },
        include: { profile: true },
      });
    } catch (error: unknown) {
      this.logger.error(`Error during user creation: ${error}`);
      handlePrismaError(error, "Error while creating user.");
    }
  }

  /**
   * Updates the user data in database
   * @param id User ID
   * @param data Data that is to be updated
   * @returns User with Profile
   */
  async updateUser(
    id: string,
    data: Partial<
      Pick<User, "email" | "password" | "role" | "status" | "isActive">
    >,
  ): Promise<UserWithProfile | null> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data,
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error updating user: ${String(error)}`);
    }
  }

  /**
   * Updates the user profile
   * @param userId User ID
   * @param data Profile data to update
   * @returns Updated profile
   */
  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
      avatar?: string;
      bio?: string;
      phoneNumber?: string;
      dateOfBirth?: Date;
      gender?: string;
      country?: string;
      state?: string;
      city?: string;
      address?: string;
      postalCode?: string;
      timezone?: string;
      language?: string;
      currency?: string;
      website?: string;
    },
  ): Promise<UserProfile | null> {
    try {
      const profile = await this.prisma.userProfile.update({
        where: { userId },
        data,
      });
      return profile;
    } catch (error: unknown) {
      throw new Error(`Error updating user profile: ${String(error)}`);
    }
  }

  /**
   * Soft delete a user
   * @param id User ID
   * @returns Deleted user
   */
  async softDelete(id: string): Promise<UserWithProfile | null> {
    try {
      const now = new Date();
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          deletedAt: now,
          profile: {
            update: {
              deletedAt: now,
            },
          },
        },
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error soft deleting user: ${String(error)}`);
    }
  }

  /**
   * Restore a soft deleted user
   * @param id User ID
   * @returns Restored user
   */
  async restore(id: string): Promise<UserWithProfile | null> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          deletedAt: null,
          profile: {
            update: {
              deletedAt: null,
            },
          },
        },
        include: { profile: true },
      });
      return user;
    } catch (error: unknown) {
      throw new Error(`Error restoring user: ${String(error)}`);
    }
  }

  /**
   * Update last login info
   * @param id User ID
   * @param ipAddress IP Address
   */
  async updateLastLogin(id: string, ipAddress?: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch (error: unknown) {
      this.logger.error(`Error updating last login: ${String(error)}`);
    }
  }

  /**
   * Increment failed login attempts
   * @param id User ID
   */
  async incrementFailedLoginAttempts(id: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user) return;

      const newAttempts = user.failedLoginAttempts + 1;
      const data: Prisma.UserUpdateInput = {
        failedLoginAttempts: newAttempts,
      };

      // Lock account after 5 failed attempts for 15 minutes
      if (newAttempts >= 5) {
        data.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id },
        data,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Error incrementing failed login attempts: ${String(error)}`,
      );
    }
  }
}
