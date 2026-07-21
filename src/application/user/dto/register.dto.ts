import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { User, UserProfile } from "@/database/entities";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  Matches,
  MinLength,
  MaxLength,
  Length,
} from "class-validator";

// Register Schema
export class RegisterDTO {
  @ApiProperty({ example: "John", description: "First Name" })
  @IsNotEmpty({ message: "First name is required" })
  firstName!: string;

  @ApiProperty({ example: "Doe", description: "Last Name" })
  @IsOptional()
  lastName?: string;

  @ApiProperty({ example: "johndoe@example.com", description: "User Email" })
  @IsEmail({}, { message: "Invalid email format" })
  email!: string;

  @ApiProperty({ example: "johndoe", description: "User username" })
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase() : value,
  )
  @IsNotEmpty({ message: "Username is required" })
  @IsString({ message: "Username must be a string" })
  @Matches(/^[a-z0-9_]+$/, {
    message: "Username must contain only letters, numbers, and underscores",
  })
  @Length(3, 30, {
    message: "Username must be between 3 and 30 characters long",
  })
  username!: string;

  @ApiProperty({ example: "Strong@123", description: "User Password" })
  @IsNotEmpty({ message: "Password is required" })
  @MinLength(6, { message: "Password must be at least 6 characters long" })
  @IsStrongPassword(
    {
      minLength: 6,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        "Password must be strong. It should contain at least 8 characters, 1 lowercase, 1 uppercase, 1 number, and 1 symbol.",
    },
  )
  password!: string;

  @ApiProperty({ example: "Strong@123", description: "Confirm Password" })
  @IsNotEmpty({ message: "Confirm Password is required" })
  confirmPassword!: string;

  @ApiProperty({
    example: "+1234567890",
    description: "Phone Number",
    required: false,
  })
  @IsOptional()
  phoneNumber?: string;
}

import type { UserWithProfile } from "../user.type";

export class RegisterResponseDTO {
  @ApiProperty({ example: "1234567890", description: "User ID" })
  id!: string;

  @ApiProperty({ example: "John Doe", description: "Full Name" })
  name!: string;

  @ApiProperty({ example: "John", description: "First Name" })
  firstName!: string;

  @ApiProperty({ example: "Doe", description: "Last Name" })
  lastName!: string | null;

  @ApiProperty({ example: "johndoe@example.com", description: "User Email" })
  email!: string;

  @ApiProperty({ example: "john_doe", description: "Username" })
  username!: string;

  @ApiProperty({ example: "USER", description: "User Role" })
  role!: string;

  @ApiProperty({
    example: "PENDING_VERIFICATION",
    description: "Account Status",
  })
  status!: string;

  @ApiProperty({ example: true, description: "Account activation status" })
  isActive!: boolean;

  constructor(
    id: string,
    firstName: string,
    lastName: string | null,
    email: string,
    username: string,
    role: string,
    status: string,
    isActive: boolean,
  ) {
    this.id = id;
    this.name = `${firstName} ${lastName ?? ""}`.trim();
    this.firstName = firstName;
    this.lastName = lastName ?? "";
    this.email = email;
    this.username = username;
    this.role = role;
    this.status = status;
    this.isActive = isActive;
  }

  static fromEntity(user: UserWithProfile): RegisterResponseDTO {
    const firstName = user.profile?.firstName ?? "";
    const lastName = user.profile?.lastName ?? null;
    return new RegisterResponseDTO(
      user.id,
      firstName,
      lastName,
      user.email,
      user.username,
      user.role,
      user.status,
      user.isActive,
    );
  }
}
