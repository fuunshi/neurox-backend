import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { InfraModule } from "@/infra/infra.module";
import { UserApplicationModule } from "../user/user.module";

@Module({
    imports: [InfraModule, UserApplicationModule],
    providers: [AuthService],
    exports: [AuthService],
})
export class AuthApplicationModule { }
