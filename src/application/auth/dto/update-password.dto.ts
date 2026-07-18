import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class UpdatePasswordDTO {
  @ApiProperty({ example: "CurrentPassword123!" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: "NewPassword123!" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword!: string;

  @ApiProperty({ example: "NewPassword123!" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newConfirmationPassword!: string;
}
