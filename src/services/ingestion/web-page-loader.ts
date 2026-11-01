import "server-only";
import { logger } from "@/lib/logger";
import type { ExtractedContent } from "@/services/ingestion/content-extractor";
import { parseDocument } from "@/services/ingestion/document-parser";
import { findSameOriginScripts, scriptDataToText } from "@/services/ingestion/script-data";
import { type RobotsCache, fetchPublicDocument, fetchPublicScript } from "@/services/ingestion/url-fetcher";

// A server-rendered page carries its content in the HTML; below this much text the page is
// probably rendered in the browser, and its content may sit in a script's data literal.
const THIN_PAGE_CHARS = 2500;
const MAX_SCRIPTS = 3;
// Scripts that are pure code render to little or nothing; below this they add only noise.
const MIN_SCRIPT_DATA_CHARS = 200;

function isHtml(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime === "text/html" || mime === "application/xhtml+xml";
}

async function loadScriptData(html: string, pageUrl: URL, robots: RobotsCache): Promise<string[]> {
  const sections: string[] = [];
  for (const scriptUrl of findSameOriginScripts(html, pageUrl, MAX_SCRIPTS)) {
    try {
      const text = scriptDataToText(await fetchPublicScript(scriptUrl.toString(), robots));
      if (text.length >= MIN_SCRIPT_DATA_CHARS) sections.push(text);
    } catch (error) {
      // Optional enrichment: the page's own text still gets ingested, so one unreachable
      // or blocked script shouldn't fail the whole import.
      logger.warn("Skipped page script", { pageUrl: pageUrl.toString(), scriptUrl: scriptUrl.toString(), error });
    }
  }
  return sections;
}

export async function loadWebPage(url: string): Promise<ExtractedContent> {
  const robots: RobotsCache = new Map();
  const fetched = await fetchPublicDocument(url, robots);
  const content = await parseDocument(fetched.body, fetched.contentType);
  if (!isHtml(fetched.contentType) || content.text.length >= THIN_PAGE_CHARS) return content;

  const scriptSections = await loadScriptData(fetched.body.toString("utf-8"), fetched.finalUrl, robots);
  if (scriptSections.length === 0) return content;

  logger.info("Added script data to a thin page", { url, scripts: scriptSections.length });
  return { ...content, text: [content.text, ...scriptSections].join("\n\n") };
}
