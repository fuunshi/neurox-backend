import { ActivityRecorderService } from "@/application/activities/activity-recorder.service";
import {
  ACTIVITY_TYPES,
  CONTEXT_TYPES,
  ENTITY_TYPES,
} from "@/common/constant/activity";
import {
  SOURCE_STATUS,
  SOURCE_TYPE,
  SourceType,
} from "@/common/constant/enums";
import {
  SOURCE_EXTENSION_MAP,
  SOURCE_LIMITS,
} from "@/common/constant/source.constant";
import {
  buildPage,
  decodeCursor,
  keysetAfter,
} from "@/common/utils/pagination/cursor.util";
import { Source, User } from "@/database/entities";
import { EntityManager, FilterQuery } from "@mikro-orm/postgresql";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { ChunkingService, TextChunk } from "./chunking.service";
import {
  CreateTextSourceDTO,
  SourceDetailResponseDTO,
  SourceListDTO,
  SourceResponseDTO,
} from "./dto/source.dto";
import { ExtractorRegistry } from "./extractors/extractor.registry";
import { ExtractionError } from "./extractors/text-extractor.interface";

export interface UploadInput {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  /** Defaults to the file name. */
  title?: string;
}

@Injectable()
export class SourceService {
  constructor(
    private readonly em: EntityManager,
    private readonly activities: ActivityRecorderService,
    private readonly chunking: ChunkingService,
    private readonly extractors: ExtractorRegistry,
  ) {}

  /**
   * Creates a source from pasted text. Nothing can fail to parse here, so the
   * result is always READY.
   */
  async createFromText(
    userId: string,
    dto: CreateTextSourceDTO,
  ): Promise<SourceResponseDTO> {
    return this.ingest(userId, {
      type: dto.type ?? SOURCE_TYPE.TEXT,
      title: dto.title,
      buffer: Buffer.from(dto.text, "utf8"),
    });
  }

  /**
   * Creates a source from an uploaded file.
   *
   * Note the contract: the upload itself succeeding is a 201, and a document
   * that cannot be parsed comes back with `status: FAILED` and `error` set,
   * rather than as an HTTP error. The file *was* accepted; the extraction is
   * what failed, and the client can act on the status.
   */
  async createFromUpload(
    userId: string,
    input: UploadInput,
  ): Promise<SourceResponseDTO> {
    if (input.buffer.length > SOURCE_LIMITS.MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds the ${Math.floor(SOURCE_LIMITS.MAX_UPLOAD_BYTES / 1024 / 1024)}MB upload limit.`,
      );
    }

    const type = this.typeFromFileName(input.fileName);

    return this.ingest(userId, {
      type,
      title: input.title?.trim() || input.fileName,
      buffer: input.buffer,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
    });
  }

  async list(userId: string, dto: SourceListDTO) {
    const where: FilterQuery<Source> = {
      user: userId,
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.status ? { status: dto.status } : {}),
      ...keysetAfter(decodeCursor(dto.cursor)),
    };

    const rows = await this.em.find(Source, where, {
      orderBy: { createdAt: "desc", id: "desc" },
      limit: dto.limit + 1,
    });

    const page = buildPage(rows, dto.limit);
    return {
      data: page.data.map((s) =>
        SourceResponseDTO.from(s, SOURCE_LIMITS.EXCERPT_CHARS),
      ),
      pagination: page.pagination,
    };
  }

  async get(
    userId: string,
    sourceId: string,
  ): Promise<SourceDetailResponseDTO> {
    const source = await this.findOwned(userId, sourceId);
    return SourceDetailResponseDTO.detailFrom(
      source,
      SOURCE_LIMITS.EXCERPT_CHARS,
    );
  }

  /**
   * The chunks this source will be fed to a generator in.
   *
   * Deterministic and computed on demand rather than stored, so re-running
   * generation after a chunking change does not need a migration.
   */
  async chunks(userId: string, sourceId: string): Promise<TextChunk[]> {
    const source = await this.findOwned(userId, sourceId);

    if (source.status !== SOURCE_STATUS.READY || !source.rawText) {
      throw new BadRequestException(
        `Source is not ready for chunking (status: ${source.status}).`,
      );
    }

    return this.chunking.chunk(source.rawText);
  }

  async delete(userId: string, sourceId: string): Promise<void> {
    const source = await this.findOwned(userId, sourceId);

    source.deletedAt = new Date();
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.SOURCE_DELETED,
      entityType: ENTITY_TYPES.SOURCE,
      entityId: source.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      data: { title: source.title },
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async ingest(
    userId: string,
    input: {
      type: SourceType;
      title: string;
      buffer: Buffer;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
    },
  ): Promise<SourceResponseDTO> {
    const source = this.em.create(Source, {
      user: this.em.getReference(User, userId),
      type: input.type,
      status: SOURCE_STATUS.PENDING,
      title: input.title,
      fileName: input.fileName ?? null,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
    });
    await this.em.flush();

    await this.activities.record({
      type: ACTIVITY_TYPES.SOURCE_CREATED,
      entityType: ENTITY_TYPES.SOURCE,
      entityId: source.id,
      actorId: userId,
      contextType: CONTEXT_TYPES.USER,
      contextId: userId,
      data: { title: source.title, type: source.type },
    });

    try {
      const extractor = this.extractors.for(input.type);
      const text = (
        await extractor.extract({
          buffer: input.buffer,
          fileName: input.fileName,
        })
      ).trim();

      if (text.length === 0) {
        throw new ExtractionError(
          "No readable text was found in this file. If it is a scanned document, it needs OCR first.",
        );
      }

      source.rawText = text;
      source.status = SOURCE_STATUS.READY;
      source.error = null;
      await this.em.flush();

      await this.activities.record({
        type: ACTIVITY_TYPES.SOURCE_TEXT_EXTRACTED,
        entityType: ENTITY_TYPES.SOURCE,
        entityId: source.id,
        actorId: userId,
        contextType: CONTEXT_TYPES.USER,
        contextId: userId,
        data: { characters: text.length },
      });
    } catch (error) {
      // Recorded on the row rather than thrown: the upload succeeded, and the
      // client needs a durable reason it can show.
      source.status = SOURCE_STATUS.FAILED;
      source.error =
        error instanceof Error ? error.message : "Text extraction failed.";
      await this.em.flush();
    }

    return SourceResponseDTO.from(source, SOURCE_LIMITS.EXCERPT_CHARS);
  }

  private typeFromFileName(fileName: string): SourceType {
    const dot = fileName.lastIndexOf(".");
    const extension = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";

    const mapped =
      SOURCE_EXTENSION_MAP[extension as keyof typeof SOURCE_EXTENSION_MAP];

    if (!mapped) {
      throw new BadRequestException(
        `Unsupported file type "${extension || fileName}". Supported: ${Object.keys(SOURCE_EXTENSION_MAP).join(", ")}.`,
      );
    }

    return mapped as SourceType;
  }

  private async findOwned(userId: string, sourceId: string): Promise<Source> {
    const source = await this.em.findOne(Source, {
      id: sourceId,
      user: userId,
    });

    if (!source) {
      throw new NotFoundException("Source not found.");
    }

    return source;
  }
}
