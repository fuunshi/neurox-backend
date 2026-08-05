import { SourceType } from "@/common/constant/enums";
import { DocxExtractor } from "./docx.extractor";
import { PdfExtractor } from "./pdf.extractor";
import { PlainTextExtractor } from "./plain-text.extractor";
import { ExtractionError, TextExtractor } from "./text-extractor.interface";
import { Injectable } from "@nestjs/common";

/**
 * Picks the extractor for a source type.
 *
 * Adding a format means adding an implementation and listing it here -- the
 * service itself never branches on type.
 */
@Injectable()
export class ExtractorRegistry {
  private readonly extractors: readonly TextExtractor[];

  constructor(
    plainText: PlainTextExtractor,
    pdf: PdfExtractor,
    docx: DocxExtractor,
  ) {
    this.extractors = [plainText, pdf, docx];
  }

  for(type: SourceType): TextExtractor {
    const extractor = this.extractors.find((e) => e.supports.includes(type));

    if (!extractor) {
      throw new ExtractionError(`No extractor is registered for ${type}.`);
    }

    return extractor;
  }

  /** Every type an extractor can handle -- used to reject uploads early. */
  supportedTypes(): SourceType[] {
    return this.extractors.flatMap((e) => [...e.supports]);
  }
}
