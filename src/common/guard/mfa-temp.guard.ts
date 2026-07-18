import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticatedRequest } from "../types/request.type";
import { TOKEN_TYPE } from "../types/token.type";

@Injectable()
export class MfaTempGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.split(" ")[1];

    const payload = await this.jwtService.verifyAsync(token);

    if (payload.tokenType !== TOKEN_TYPE.MFA_TEMP) {
      throw new UnauthorizedException("Invalid token type");
    }

    req.authContext.user = payload;

    // attach raw token manually
    req.authContext.token = {
      type: payload.tokenType,
      value: token,
    };

    return true;
  }
}
