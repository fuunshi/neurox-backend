import { AccountLifecycleService } from "@/application/account/account-lifecycle.service";
import { AllowTokenTypes, Public } from "@/common/decorators/auth.decorator";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { TOKEN_TYPE } from "@/common/types/token.type";
import { RealtimeTicketService } from "@/realtime/realtime.ticket";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { ForgotPasswordDTO } from "./dto/forgot-password.dto";
import {
  AuthLoginResponseDTO,
  LoginDTO,
  LoginResponseDTO,
} from "./dto/login.dto";
import { RefreshDTO, RefreshResponseDTO } from "./dto/refresh.dto";
import { RecoverAccountDTO } from "./dto/recover-account.dto";
import { DeleteAccountDTO } from "./dto/delete-account.dto";
import { ResendVerificationDTO } from "./dto/resend-verification.dto";
import { ResetPasswordDTO } from "./dto/reset-password.dto";
import { UpdatePasswordDTO } from "./dto/update-password.dto";
import { VerifyEmailQueryDTO } from "./dto/verify-email.query.dto";
import { MFADTO } from "./dto/verify-mfa.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountLifecycle: AccountLifecycleService,
    private readonly realtimeTickets: RealtimeTicketService,
  ) {}

  /**
   * This Method calls login service which handles the login logic.
   * @param loginDTO Login Data like email, password are validated and passed.
   * @returns Login response with user info and tokens.
   */

  @Public()
  @Post("login")
  @ApiOperation({ summary: "Login" })
  @ApiResponse({
    status: 200,
    description: "Login Authentication",
    type: LoginResponseDTO,
  })
  async login(
    @Req() req: AuthenticatedRequest,
    @Body() loginDTO: LoginDTO,
  ): Promise<AuthLoginResponseDTO> {
    const ipAddress: string = req.ip;
    const userAgent: string | undefined = req.headers["user-agent"];
    return await this.authService.login(ipAddress, userAgent, loginDTO);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get Current User" })
  @ApiResponse({
    status: 200,
    description: "Current user retrieved successfully",
  })
  async getCurrentUserAuthContext(
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    const userId: string = req.authContext.user.id;
    return await this.authService.getAuthDetails(userId);
  }

  @Post("mfa/setup")
  @AllowTokenTypes(TOKEN_TYPE.MFA_TEMP, TOKEN_TYPE.ACCESS)
  @ApiOperation({ summary: "Setup MFA" })
  @ApiResponse({
    status: 200,
    description: "MFA Setup",
  })
  async setupMfa(@Req() req: AuthenticatedRequest): Promise<any> {
    const userId = req.authContext.user.id;
    const token = req.authContext.token;
    return await this.authService.setupMfa(userId, token);
  }

  @Post("mfa/enable")
  @AllowTokenTypes(TOKEN_TYPE.MFA_TEMP, TOKEN_TYPE.ACCESS)
  @ApiOperation({ summary: "Enable MFA" })
  @ApiResponse({
    status: 200,
    description: "MFA Enable",
  })
  async enableMfa(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MFADTO,
  ): Promise<LoginResponseDTO | { message: string }> {
    const userId = req.authContext.user.id;
    const token = req.authContext.token;
    const ipAddress: string = req.ip;
    const userAgent: string = req.headers["user-agent"] ?? "unknown";
    return await this.authService.enableMfa(userId, token, dto, {
      ipAddress,
      userAgent,
    });
  }

  @Post("mfa/verify")
  @AllowTokenTypes(TOKEN_TYPE.MFA_TEMP)
  @ApiOperation({ summary: "Verify MFA" })
  @ApiResponse({
    status: 200,
    description: "Verify MFA code and complete login",
    type: LoginResponseDTO,
  })
  async verifyMfa(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MFADTO,
  ): Promise<LoginResponseDTO> {
    const ipAddress: string = req.ip;
    const userAgent: string = req.headers["user-agent"] ?? "unknown";
    const userId = req.authContext.user.id;
    const token = req.authContext.token;

    return await this.authService.verifyMfaCode(userId, token, dto, {
      ipAddress,
      userAgent,
    });
  }

  @Post("mfa/disable")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Disable MFA" })
  @ApiResponse({
    status: 200,
    description: "MFA Disable",
  })
  async disableMfa(
    @Req() req: AuthenticatedRequest,
    @Body() dto: MFADTO,
  ): Promise<{ message: string }> {
    const userId = req.authContext.user.id;
    return await this.authService.disableMfa(userId, dto);
  }

  /**
   * This method calls forget password service which handles the
   * forgot password logic and sends reset password email.
   *
   * @param forgotPasswordDTO contains the user email for which password reset is requested.
   * @returns A generic message indicating that reset password email has been sent.
   */

  @Public()
  @Post("forgot-password")
  @ApiOperation({ summary: "Forgot Password" })
  @ApiResponse({
    status: 200,
    description: "Forgot Password Request",
    type: String,
  })
  async forgotPassword(
    @Req() req: AuthenticatedRequest,
    @Body() forgotPasswordDTO: ForgotPasswordDTO,
  ): Promise<{ message: string }> {
    const ipAddress: string = req.ip;
    const userAgent: string | undefined = req.headers["user-agent"];
    return await this.authService.forgotPassword(
      forgotPasswordDTO,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Mints a ticket for opening a realtime socket.
   *
   * Deliberately on the *auth* controller and behind the ordinary access token:
   * a socket is a way to receive data, so the credential that opens one is
   * issued the same way the credential that reads data is — and only to someone
   * already signed in. The ticket it returns is typed `REALTIME`, which no REST
   * route accepts, so it cannot be used to read anything.
   *
   * The client asks for a new one per connection. See `realtime.ticket.ts`.
   */
  @Post("realtime-ticket")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get a short-lived ticket for the realtime socket" })
  @ApiResponse({ status: 200, description: "Ticket issued" })
  realtimeTicket(@Req() req: AuthenticatedRequest): {
    ticket: string;
    expiresInSeconds: number;
  } {
    // Synchronous: signing a JWT is CPU work, not I/O, so there is nothing to
    // await and an `async` here would only add a microtask.
    return this.realtimeTickets.issue(req.authContext.user.id);
  }

  /**
   * Deletes the caller's own account, softly, and starts its recovery window.
   *
   * This is the entry point the rest of the lifecycle was missing: the grace
   * period, `recover-account` above, the `ACCOUNT_RECOVERABLE` conflict on
   * register and the recycling cron all read `deletedAt`, and nothing else in
   * the codebase ever set it.
   *
   * The response carries the deadline so the client can say how long the
   * account can still be brought back, rather than leaving the reader to
   * discover the window by losing it.
   */
  @Post("delete-account")
  @ApiOperation({ summary: "Delete your own account" })
  @ApiResponse({
    status: 200,
    description: "Account scheduled for deletion",
  })
  @ApiResponse({ status: 401, description: "The password is wrong" })
  async deleteAccount(
    @Req() req: AuthenticatedRequest,
    @Body() deleteAccountDTO: DeleteAccountDTO,
  ): Promise<{ message: string; recoverableUntil: Date }> {
    const { recoverableUntil } = await this.accountLifecycle.remove(
      req.authContext.user.id,
      deleteAccountDTO.password,
    );

    return {
      message:
        "Your account has been deleted and can still be recovered during the grace period.",
      recoverableUntil,
    };
  }

  /**
   * Sends a new verification link.
   *
   * Until now the only way to get one was to attempt a login that would be
   * rejected for being unverified — which is a strange thing to ask of someone
   * who cannot sign in. The link expires in fifteen minutes, so a reader who
   * misplaced the first email had no way forward at all.
   *
   * Always answers `200`, whether or not the address belongs to an unverified
   * account: this endpoint is public, and a different answer for a known address
   * would turn it into a way to discover who has an account here.
   */
  @Public()
  @Post("resend-verification")
  @ApiOperation({ summary: "Send a new verification link" })
  @ApiResponse({
    status: 200,
    description:
      "Accepted. Sent if the address belongs to an unverified account.",
  })
  async resendVerification(
    @Body() resendVerificationDTO: ResendVerificationDTO,
  ): Promise<{ message: string }> {
    await this.authService.resendVerification(resendVerificationDTO.email);

    return {
      message:
        "If that address needs confirming, a new link has been sent to it.",
    };
  }

  /**
   * Restores a soft-deleted account that is still inside its recovery window.
   *
   * Ownership is proven with the account's original password rather than an
   * emailed link, so recovery does not depend on mail delivery to an address
   * the user may no longer control. Registration returns
   * `ACCOUNT_RECOVERABLE` when this endpoint is the right next step.
   *
   * Tokens are not issued here; the caller logs in normally afterwards, which
   * keeps token issuance in one place.
   */
  @Public()
  @Post("recover-account")
  @ApiOperation({ summary: "Recover a recently deleted account" })
  @ApiResponse({
    status: 200,
    description: "Account recovered",
    type: String,
  })
  @ApiResponse({
    status: 401,
    description:
      "No recoverable account, the recovery window has expired, or the password is wrong",
  })
  async recoverAccount(
    @Body() recoverAccountDTO: RecoverAccountDTO,
  ): Promise<{ message: string }> {
    await this.accountLifecycle.recover(
      recoverAccountDTO.email,
      recoverAccountDTO.password,
    );

    return {
      message: "Account recovered successfully. You can now log in.",
    };
  }
  /**
   * This Method calls logout service which handles the logout logic.
   * @returns void
   */
  @Post("logout")
  @ApiOperation({ summary: "Logout" })
  @ApiResponse({
    status: 200,
    description: "Logout Authentication",
  })
  @ApiBearerAuth()
  async logout(@Req() req: AuthenticatedRequest): Promise<void> {
    const userId: string = req.authContext.user.id;
    const userAgent: string | undefined = req.headers["user-agent"];
    return await this.authService.logout(userId, userAgent);
  }

  /**
   * This Method calls refresh token service which generates a new refresh token.
   *
   * Accepts a REFRESH token in the Authorization header, not only an ACCESS
   * token. Without this the guard applies its ACCESS-only default, so the
   * endpoint is unusable for its one purpose: refreshing a session whose access
   * token has already expired, which is the only time a client needs it. The
   * service still verifies the refresh token against the token table, and the
   * token is sent in the body as well because RefreshDTO requires it.
   *
   * @returns A new access token and refresh token.
   */
  @Post("refresh")
  @AllowTokenTypes(TOKEN_TYPE.REFRESH)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Refresh Token" })
  @ApiResponse({
    status: 200,
    description: "Refresh Token",
    type: RefreshResponseDTO,
  })
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Body() refreshTokenDTO: RefreshDTO,
  ): Promise<RefreshResponseDTO> {
    return await this.authService.refreshLoginToken(refreshTokenDTO);
  }

  /**
   * A second phase for the forgot password flow after user clicks the reset link with reset token
   * This method calls reset password service which resets the user password after validating the reset token.
   * @param resetPasswordDTO Contains the new password and the reset token.
   * @returns A message indicating password reset success.
   */
  @Public()
  @Post("reset-password")
  @ApiOperation({ summary: "Reset Password" })
  @ApiResponse({
    status: 200,
    description: "Reset Password",
    type: String,
  })
  async resetPassword(
    @Body() resetPasswordDTO: ResetPasswordDTO,
  ): Promise<{ message: string }> {
    return await this.authService.resetPassword(resetPasswordDTO);
  }

  /**
   * This method verifies a user's email using a token sent via email.
   * Typically called when the user clicks the verification link.
   *
   * @param query Contains the verification token and optionally other identifiers.
   * @returns A message indicating whether email verification was successful.
   */
  @Public()
  @Get("verify-email")
  @ApiOperation({ summary: "Verify Email" })
  @ApiResponse({
    status: 200,
    description: "Email Verification",
    type: String,
  })
  async verifyEmail(
    @Query() query: VerifyEmailQueryDTO,
  ): Promise<{ message: string }> {
    return await this.authService.verifyEmail(query.token);
  }

  /**
   * This method allows authenticated users to update their password.
   * It requires the current password for verification and the new password.
   * @body Contains currentPassword, newPassword and newConfirmationPassword.
   * @returns A message indicating whether the password update was successful.
   */
  @Post("update-password")
  @AllowTokenTypes(TOKEN_TYPE.ACCESS, TOKEN_TYPE.TEMP)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update Password" })
  @ApiResponse({
    status: 200,
    description: "Update Password",
    type: String,
  })
  async updatePassword(
    @Req() req: AuthenticatedRequest,
    @Body() updatePasswordDTO: UpdatePasswordDTO,
  ): Promise<{ message: string }> {
    const userId = req.authContext.user.id; // Get the authenticated user ID from the request
    const token = req.authContext.token; // Get the token from the request (can be access or MFA temp token)
    return await this.authService.updatePassword(
      userId,
      updatePasswordDTO,
      token,
    );
  }
}
