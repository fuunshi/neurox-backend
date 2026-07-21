import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { UserService } from "./user.service";
import { ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { RegisterDTO, RegisterResponseDTO } from "./dto/register.dto";
import { Public } from "@/common/decorators/auth.decorator";
import { AuthenticatedRequest } from "@/common/types/request.type";
import { User, UserProfile } from "@/database/entities";
import { UpdateUserProfileDTO } from "./dto/update-user-profile.dto";
@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Register User to the system
   * @param registerDTO User Details like name, email, phone number, email and so on
   * @returns User details
   */
  @Public()
  @Post("register")
  @ApiOperation({ summary: "Register" })
  @ApiResponse({
    status: 200,
    description: "Register Authentication",
    type: RegisterResponseDTO,
  })
  async register(
    @Body() registerDTO: RegisterDTO,
  ): Promise<RegisterResponseDTO> {
    return await this.userService.register(registerDTO);
  }

  @Get("metadata")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get User Metadata" })
  @ApiResponse({
    status: 200,
    description: "User metadata retrieved successfully",
  })
  async metadata(@Req() req: AuthenticatedRequest): Promise<any> {
    return await this.userService.metadata(req.authContext.user.id);
  }

  /**
   * This endpoint calls updateUserProfile method in user service to update user's profile information
   * @param req Contains user information in the request object
   * @param data UpdateProfileDTO containing the fields like firstname, lastname, avatar, bio, etc that can be updated in user profile
   * @returns updated profile information of the user or null if no update is done
   */

  @Put("update-profile")
  @ApiOperation({ summary: "Update User Profile" })
  @ApiResponse({
    status: 200,
    description: "User profile updated successfully",
  })
  @ApiBearerAuth()
  async updateUserProfile(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateUserProfileDTO,
  ): Promise<UserProfile | null> {
    const userId = req.authContext.user.id;
    return await this.userService.updateUserProfile(userId, data);
  }

  @Get("me/profile")
  @ApiOperation({ summary: "Get My Profile" })
  @ApiResponse({
    status: 200,
    description: "User profile retrieved successfully",
  })
  @ApiBearerAuth()
  async getMyProfile(@Req() req: AuthenticatedRequest): Promise<any> {
    const userId = req.authContext.user.id;
    return await this.userService.getUserDetails(userId);
  }
}
