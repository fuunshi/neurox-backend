import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class VerifyEmailQueryDTO {
  @ApiProperty({
    example: "a-long-random-verification-token",
    description: "Email verification token",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
