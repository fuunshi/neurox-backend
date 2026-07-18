import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { FastifyRequest } from "fastify";
import {
  ALLOW_TOKEN_TYPES_KEY,
  IS_PUBLIC_KEY,
} from "../decorators/auth.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { AuthenticatedRequest, RequestTokenType } from "../types/request.type";
import { JwtTokenType, TOKEN_TYPE } from "../types/token.type";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtSecret: string;
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.getOrThrow<string>("auth.jwtSecret");
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Public route check
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // 2. Extract token
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Authorization token missing");
    }

    try {
      // 3. Verify JWT
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.jwtSecret,
      });

      // 4. Get allowed token types (DEFAULT = ACCESS only)
      const allowedTypes = this.reflector.getAllAndOverride<JwtTokenType[]>(
        ALLOW_TOKEN_TYPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [TOKEN_TYPE.ACCESS];

      // 5. Validate token type
      if (!allowedTypes.includes(payload.type)) {
        if (payload.type === TOKEN_TYPE.MFA_TEMP) {
          throw new UnauthorizedException("MFA verification required");
        }

        if (payload.type === TOKEN_TYPE.REFRESH) {
          throw new UnauthorizedException("Access token required");
        }

        throw new UnauthorizedException("Invalid token type");
      }

      // 6. Attach user
      request.authContext = {
        user: {
          id: payload.id,
          role: payload.role,
        },

        token: {
          value: token,
          type: payload.type,
          purpose: payload.purpose,
        },
      };
    } catch (err) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }

  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];

    return type === "Bearer" ? token : undefined;
  }
}
