import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class RecoverAccountDTO {
  @ApiProperty({
    example: "user@example.com",
    description: "Email of the deleted account to recover",
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: "S3curePassw0rd!",
    description:
      "The account's original password, used to prove ownership. Recovery does not depend on mail delivery because the address may no longer be accessible.",
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
