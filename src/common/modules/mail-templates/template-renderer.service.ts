import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readdir, readFile } from "fs/promises";
import * as Handlebars from "handlebars";
import mjml2html from "mjml";
import { basename, join } from "path";
import {
  TEMPLATE_REGISTRY,
  TemplateContext,
  TemplatePayload,
  TemplateRegistryEntry,
} from "./registry";
import { BaseContext } from "./types";

type RenderResult = { subject: string; html: string; text?: string };

type RegistryEntry = TemplateRegistryEntry<any, any>;

@Injectable()
export class TemplateRendererService {
  private readonly logger = new Logger(TemplateRendererService.name);
  private templateCache = new Map<string, Handlebars.TemplateDelegate>();
  private partialsLoaded = false;
  private readonly baseContext: BaseContext;

  constructor(private readonly configService: ConfigService) {
    this.baseContext = {
      appName: this.configService.getOrThrow("app.appName"),
      supportEmail: this.configService.getOrThrow("app.supportEmail"),
      frontendBaseUrl: this.configService.getOrThrow("app.frontendBaseUrl"),
      userLoginUrl: `${this.configService.getOrThrow("app.frontendBaseUrl")}/auth/login`,
    };
  }

  private async loadTemplate(path: string): Promise<string> {
    const content = await readFile(path, "utf8");
    return content;
  }

  private async loadPartials(): Promise<void> {
    if (this.partialsLoaded) {
      return;
    }

    const partialsDir = join(__dirname, "templates", "partials");

    try {
      const entries = await readdir(partialsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        const filePath = join(partialsDir, entry.name);
        const partialName = basename(entry.name)
          .replace(/\.(mjml\.)?hbs$/, "")
          .replace(/^_/, "");
        const content = await this.loadTemplate(filePath);
        Handlebars.registerPartial(partialName, content);
        this.logger.log(`Registered partial: ${partialName}`);
      }

      this.partialsLoaded = true;
    } catch (error) {
      this.logger.warn(`No mail partials loaded: ${String(error)}`);
      this.partialsLoaded = true;
    }
  }

  private compileTemplate(key: string, content: string) {
    const compiled = Handlebars.compile(content);
    this.templateCache.set(key, compiled);
    return compiled;
  }

  private getCached(key: string) {
    return this.templateCache.get(key) ?? null;
  }

  async render<K extends keyof typeof TEMPLATE_REGISTRY>(
    templateKey: K,
    payload: Record<string, unknown>,
  ): Promise<RenderResult> {
    await this.loadPartials();

    const entry = TEMPLATE_REGISTRY[templateKey] as RegistryEntry;
    if (!entry)
      throw new Error(`Template not registered: ${String(templateKey)}`);

    const filePath = entry.file;
    let compiled = this.getCached(filePath);
    let mjml: string;

    if (!compiled) {
      const content = await this.loadTemplate(filePath);
      compiled = this.compileTemplate(filePath, content);
    }

    const dynamicContext =
      entry.buildContext?.(payload as any, this.baseContext) ?? {};

    const context = {
      ...this.baseContext,
      ...payload,
      ...dynamicContext,
    } as TemplatePayload<K> & TemplateContext<K> & BaseContext;

    mjml = compiled(context);

    this.logger.log(`Rendered email: \n ${mjml}`);
    this.logger.log(`MJML output starts with: ${mjml.substring(0, 150)}`);

    const rendered = await mjml2html(mjml, { validationLevel: "strict" });
    if (rendered.errors && rendered.errors.length > 0) {
      this.logger.error(
        `MJML render errors for ${filePath}: ${JSON.stringify(rendered.errors)}`,
      );
      throw new Error("MJML rendering failed");
    }

    const subjectTemplate = entry.subject || "";
    const subject = Handlebars.compile(subjectTemplate)(context);

    return { subject, html: rendered.html };
  }
}

export default TemplateRendererService;
