import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { DOCX_MIME, PDF_MIME } from "@/utils/validation";
import {
  type ExtractedContent,
  extractMainContent,
  htmlToStructuredText,
  markPlainTextHeadings,
  normalizeWhitespace,
} from "@/services/ingestion/content-extractor";

async function parsePdf(bytes: Uint8Array): Promise<ExtractedContent> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  return { title: null, text: markPlainTextHeadings(pages.join("\n\n")) };
}

// convertToHtml rather than extractRawText: mammoth maps Word heading styles to <h1>..<h6>,
// which the chunker needs for section boundaries.
async function parseDocx(bytes: Uint8Array): Promise<ExtractedContent> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  return { title: null, text: htmlToStructuredText(html) };
}

function baseMime(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}

export async function parseDocument(bytes: Uint8Array, contentType: string): Promise<ExtractedContent> {
  const mime = baseMime(contentType);
  try {
    if (mime === PDF_MIME) return await parsePdf(bytes);
    if (mime === DOCX_MIME) return await parseDocx(bytes);

    const text = new TextDecoder("utf-8").decode(bytes);
    if (mime === "text/html" || mime === "application/xhtml+xml") return extractMainContent(text);
    if (mime === "text/plain" || mime === "text/markdown") {
      return { title: null, text: normalizeWhitespace(text) };
    }
  } catch (error) {
    throw new Error(`Failed to parse ${mime} document`, { cause: error });
  }
  throw new Error(`Unsupported content type: ${mime}`);
}
