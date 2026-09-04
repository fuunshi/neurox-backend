import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

/**
 * Asking for a new verification link.
 *
 * Public, so the caller is identified by the address they claim rather than by
 * a session — which is the whole point, since an unverified account cannot
 * usefully sign in.
 */
export class ResendVerificationDTO {
  @ApiProperty({
    example: "user@example.com",
    description: "The address to send a new verification link to",
  })
  @IsEmail()
  email!: string;
}
