import { Module } from "@nestjs/common";
import { InfraModule } from "@/infra/infra.module";
import { EmailSenderService } from "./email.sender.service";
import { EmailWorkerProcessor } from "./email.worker.processor";
import { TemplateRendererService } from "@/infra/mail-templates/template-renderer.service";

@Module({
  imports: [InfraModule],
  providers: [
    EmailSenderService,
    EmailWorkerProcessor,
    TemplateRendererService,
  ],
})
export class EmailWorkerModule {}
