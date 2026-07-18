import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Length } from "class-validator";

export class MFADTO {
  @ApiProperty({
    example: "123456",
    description: "otp code",
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: "OTP must be 6 digits" })
  otp!: string;
}
