import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

/**
 * Deleting your own account.
 *
 * Only a password, and no email: the caller is already authenticated, so the
 * account to delete is the one the session belongs to. Taking an email here
 * would invite passing someone else's.
 */
export class DeleteAccountDTO {
  @ApiProperty({
    example: "S3curePassw0rd!",
    description:
      "The account's current password. Required even though the caller is " +
      "authenticated, because deleting is not undone by signing in again — it " +
      "starts a clock — and a borrowed session must not be able to end an account.",
  })
  @IsString()
  @MinLength(1)
  password!: string;
}
