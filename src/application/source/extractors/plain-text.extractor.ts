import {
  ExtractionError,
  ExtractionInput,
  TextExtractor,
} from "./text-extractor.interface";
import { SOURCE_TYPE, SourceType } from "@/common/constant/enums";
import { Injectable } from "@nestjs/common";

/**
 * Text, markdown and .txt are already text -- the only work is decoding, and
 * rejecting the binary files people inevitably upload with a .txt extension.
 */
@Injectable()
export class PlainTextExtractor implements TextExtractor {
  readonly supports: readonly SourceType[] = [
    SOURCE_TYPE.TEXT,
    SOURCE_TYPE.MARKDOWN,
    SOURCE_TYPE.TXT,
  ];

  extract({ buffer }: ExtractionInput): Promise<string> {
    const decoded = buffer.toString("utf8");

    // A NUL byte in the first block is the standard heuristic for "this is not
    // text". Without this, a mislabelled .doc becomes a page of mojibake that
    // silently generates nonsense cards.
    const probe = buffer.subarray(0, 512);
    if (probe.includes(0)) {
      throw new ExtractionError(
        "File does not look like text (it contains binary data). Check the file type.",
      );
    }

    return Promise.resolve(decoded);
  }
}
