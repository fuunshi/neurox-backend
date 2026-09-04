import {
  IsOptional,
  IsUrl,
  IsString,
  IsISO8601,
  IsJSON,
  IsPhoneNumber,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateUserProfileDTO {
  @ApiProperty({ example: "John", description: "First Name", required: false })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: "Doe", description: "Last Name", required: false })
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    example: "John Doe",
    description: "Display Name",
    required: false,
  })
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    example: "https://example.com/avatar.jpg",
    description: "Avatar URL",
    required: false,
  })
  @IsOptional()
  avatar?: string;

  @ApiProperty({
    example: "Software Developer",
    description: "Bio",
    required: false,
  })
  @IsOptional()
  bio?: string;

  @ApiProperty({
    example: "+1234567890",
    description: "Phone Number",
    required: false,
  })
  @IsOptional()
  @IsPhoneNumber()
  phoneNumber?: string;

  @ApiProperty({
    example: "1990-01-01",
    description: "Date of Birth",
    required: false,
  })
  @IsOptional()
  @IsISO8601()
  dateOfBirth?: Date;

  @ApiProperty({
    example: "https://example.com/portfolio",
    description: "Portfolio URL",
    required: false,
  })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ example: "UTC+0", description: "Timezone", required: false })
  @IsOptional()
  timezone?: string;

  @ApiProperty({
    example: "English",
    description: "Preferred Language",
    required: false,
  })
  @IsOptional()
  language?: string;

  @ApiProperty({
    example: "USD",
    description: "Preferred Currency",
    required: false,
  })
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: "USA", description: "Country", required: false })
  @IsOptional()
  country?: string;

  @ApiProperty({ example: "California", description: "State", required: false })
  @IsOptional()
  state?: string;

  @ApiProperty({ example: "Los Angeles", description: "City", required: false })
  @IsOptional()
  city?: string;

  @ApiProperty({
    example: "123 Main St",
    description: "Address",
    required: false,
  })
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: "90001",
    description: "Postal Code",
    required: false,
  })
  @IsOptional()
  postalCode?: string;

  @ApiProperty({
    example: "www.facebook.com/johndoe",
    description: "socialLinks",
    required: false,
  })
  @IsOptional()
  @IsJSON()
  socialLinks?: string;

  @ApiProperty({
    example: "Preference1",
    description: "User preference",
    required: false,
  })
  @IsOptional()
  @IsJSON()
  preferences?: string;
}
