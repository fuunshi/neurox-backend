import { softDeleteFilters } from "../filters/soft-delete.filter";
import { SOURCE_STATUS } from "@/common/constant/enums/source-status.enum";
import { SOURCE_TYPE } from "@/common/constant/enums/source-type.enum";
import { GenerationJob } from "./generation-job.entity";
import { User } from "./user.entity";
import { defineEntity, p } from "@mikro-orm/core";

/**
 * Raw input material — pasted text or an uploaded document — that flash cards
 * are generated from.
 *
 * The file metadata and the extracted `rawText` live on the same row on
 * purpose: the uploaded bytes may be discarded later, but the text a set of
 * cards was derived from is worth keeping for provenance and re-generation.
 */
const SourceSchema = defineEntity({
  name: "Source",
  tableName: "source",
  properties: {
    id: p.uuid().primary().defaultRaw("gen_random_uuid()"),
    user: () => p.manyToOne(User).joinColumn("user_id").inversedBy("sources"),
    type: p.enum(() => SOURCE_TYPE).nativeEnumName("source_type"),
    status: p
      .enum(() => SOURCE_STATUS)
      .nativeEnumName("source_status")
      .default(SOURCE_STATUS.PENDING),
    title: p.string(),
    /** Extracted plain text. Populated once status reaches READY. */
    rawText: p.text().fieldName("raw_text").nullable(),
    fileName: p.string().fieldName("file_name").nullable(),
    mimeType: p.string().fieldName("mime_type").nullable(),
    sizeBytes: p.integer().fieldName("size_bytes").nullable(),
    /** Where the uploaded original is stored, if retained. */
    storagePath: p.string().fieldName("storage_path").nullable(),
    /** Populated when extraction fails, so the cause is not lost. */
    error: p.text().nullable(),
    deletedAt: p.datetime().fieldName("deleted_at").nullable(),
    createdAt: p
      .datetime()
      .fieldName("created_at")
      .onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .fieldName("updated_at")
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
    generationJobs: () => p.oneToMany(GenerationJob).mappedBy("source"),
  },
  filters: softDeleteFilters,
  indexes: [
    { properties: ["user"] },
    { properties: ["status"] },
    { properties: ["deletedAt"] },
    { properties: ["user", "createdAt"] },
  ],
});

export class Source extends SourceSchema.class {}
SourceSchema.setClass(Source);
