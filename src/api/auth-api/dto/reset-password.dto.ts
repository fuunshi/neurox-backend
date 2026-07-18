import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsStrongPassword } from "class-validator";

export class ResetPasswordDTO {
  @ApiProperty({ example: "reset-token", description: "Reset token" })
  @IsNotEmpty({ message: "Token is required" })
  token!: string;

  @ApiProperty({ example: "new-password", description: "New password" })
  @IsNotEmpty({ message: "Password is required" })
  @IsStrongPassword({
    minLength: 6,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  })
  newPassword!: string;
}
