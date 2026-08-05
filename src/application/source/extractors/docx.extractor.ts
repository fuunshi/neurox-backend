import {
  ExtractionError,
  ExtractionInput,
  TextExtractor,
} from "./text-extractor.interface";
import { SOURCE_TYPE, SourceType } from "@/common/constant/enums";
import { Injectable } from "@nestjs/common";
import * as mammoth from "mammoth";

@Injectable()
export class DocxExtractor implements TextExtractor {
  readonly supports: readonly SourceType[] = [SOURCE_TYPE.DOCX];

  async extract({ buffer }: ExtractionInput): Promise<string> {
    try {
      // `extractRawText` drops formatting, which is what we want: card
      // generation cares about the words, not the styling.
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch (error) {
      throw new ExtractionError(
        "Could not read this document. It may be corrupt or not a .docx file.",
        error,
      );
    }
  }
}
