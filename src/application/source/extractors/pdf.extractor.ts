import {
  ExtractionError,
  ExtractionInput,
  TextExtractor,
} from "./text-extractor.interface";
import { SOURCE_TYPE, SourceType } from "@/common/constant/enums";
import { Injectable } from "@nestjs/common";
import { PDFParse } from "pdf-parse";

@Injectable()
export class PdfExtractor implements TextExtractor {
  readonly supports: readonly SourceType[] = [SOURCE_TYPE.PDF];

  async extract({ buffer }: ExtractionInput): Promise<string> {
    // pdf-parse takes ownership of the typed array, so hand it a copy.
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const result = await parser.getText();
      return result.text ?? "";
    } catch (error) {
      throw new ExtractionError(
        "Could not read this PDF. It may be encrypted, scanned, or corrupt.",
        error,
      );
    } finally {
      // The parser holds a worker; not destroying it leaks the thread.
      await parser.destroy().catch(() => undefined);
    }
  }
}
