import { AllowTokenTypes, Public } from "@/common/decorators/auth.decorator";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { TOKEN_TYPE } from "@/common/types/token.type";
import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
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
import { ResetPasswordDTO } from "./dto/reset-password.dto";
import { UpdatePasswordDTO } from "./dto/update-password.dto";
import { VerifyEmailQueryDTO } from "./dto/verify-email.query.dto";
import { MFADTO } from "./dto/verify-mfa.dto";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
   * @returns A new access token and refresh token.
   */
  @Post("refresh")
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
