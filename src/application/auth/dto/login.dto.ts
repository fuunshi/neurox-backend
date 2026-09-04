import { UserWithToken } from "@/application/user/user.type";
import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString, IsEnum } from "class-validator";

export enum LoginStep {
  UPDATE_PASSWORD = "UPDATE_PASSWORD",
  MFA_SETUP_REQUIRED = "MFA_SETUP_REQUIRED",
  MFA_REQUIRED = "MFA_REQUIRED",
  AUTHENTICATED = "AUTHENTICATED",
}

// Login Request Validation DTO
export class LoginDTO {
  @ApiProperty({ example: "johndoe@example.com", description: "User email" })
  @IsNotEmpty({ message: "Email is required" })
  @IsEmail({}, { message: "Invalid email format" })
  email!: string;

  @ApiProperty({ example: "Strong@123", description: "User password" })
  @IsNotEmpty({ message: "Password is required" })
  password!: string;
}

export class LoginResponseDTO {
  @ApiProperty({
    example: "1234567890",
    description: "User ID",
  })
  id!: string;

  @ApiProperty({
    example: "John Doe",
    description: "Full Name",
  })
  name!: string;

  @ApiProperty({
    example: "John",
    description: "First Name",
  })
  firstName!: string;

  @ApiProperty({
    example: "Doe",
    description: "Last Name",
  })
  lastName!: string | null;

  @ApiProperty({
    example: "johndoe@example.com",
    description: "User email",
  })
  email!: string;

  @ApiProperty({
    example: "USER",
    description: "User role",
  })
  role!: string;

  @ApiProperty({
    example:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    description: "JWT token",
  })
  accessToken!: string;

  @ApiProperty({
    example:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    description: "Refresh token",
  })
  refreshToken!: string;

  constructor(
    id: string,
    firstName: string,
    lastName: string | null,
    email: string,
    role: string,
    accessToken: string,
    refreshToken: string,
  ) {
    this.id = id;
    this.name = `${firstName} ${lastName ?? ""}`.trim();
    this.firstName = firstName;
    this.lastName = lastName ?? "";
    this.email = email;
    this.role = role;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  static fromEntity(data: UserWithToken): LoginResponseDTO {
    const firstName = data.profile?.firstName ?? "";
    const lastName = data.profile?.lastName ?? null;
    return new LoginResponseDTO(
      data.id,
      firstName,
      lastName,
      data.email,
      data.role,
      data.accessToken,
      data.refreshToken,
    );
  }
}

export class MfaResponseDTO {
  @ApiProperty({
    enum: LoginStep,
    example: LoginStep.MFA_SETUP_REQUIRED,
    description: "MFA setup required",
  })
  @IsEnum(LoginStep)
  step!: LoginStep;

  @ApiProperty({
    example: "a-long-random-temporary-token",
    description: "temporary token",
  })
  @IsString()
  @IsNotEmpty()
  temporaryToken!: string;
}

export type AuthLoginResponseDTO = LoginResponseDTO | MfaResponseDTO;
