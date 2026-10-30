import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ExtractedContent = { title: string | null; text: string };

const SKIPPED_TAGS = new Set([
  "script", "style", "noscript", "template", "svg", "canvas", "iframe",
  "nav", "footer", "aside", "form", "button", "img", "picture", "video", "audio",
]);
const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "header", "blockquote",
  "ul", "ol", "dl", "dt", "dd", "table", "tr", "figure", "figcaption",
]);

// Minimal structural types so this works with linkedom's DOM without depending on lib.dom.
type DomNode = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
};

function renderChildren(node: DomNode): string {
  return Array.from(node.childNodes).map(renderNode).join("");
}

function renderNode(node: DomNode): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";

  const tag = node.nodeName.toLowerCase();
  if (SKIPPED_TAGS.has(tag)) return "";

  const heading = /^h([1-6])$/.exec(tag);
  if (heading) {
    const title = renderChildren(node).replace(/\s+/g, " ").trim();
    return title ? `\n\n${"#".repeat(Number(heading[1]))} ${title}\n\n` : "";
  }

  switch (tag) {
    case "br":
      return "\n";
    case "pre":
      return `\n\n\`\`\`\n${(node.textContent ?? "").replace(/\n+$/, "")}\n\`\`\`\n\n`;
    case "code":
      return `\`${node.textContent ?? ""}\``;
    case "li":
      return `\n- ${renderChildren(node).trim()}`;
    case "td":
    case "th":
      return `${renderChildren(node).trim()} | `;
  }

  const inner = renderChildren(node);
  return BLOCK_TAGS.has(tag) ? `\n\n${inner}\n\n` : inner;
}

// Fenced code keeps its indentation; everything else gets spaces collapsed.
// Splitting on the fence leaves code at the odd indices.
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/(\n```[^\n]*\n[\s\S]*?\n```)/)
    .map((segment, i) =>
      i % 2 === 1
        ? segment
        : segment.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n"),
    )
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Converts an HTML fragment to "# Heading" structured text. Use for trusted
// whole documents (DOCX output); web pages go through extractMainContent.
export function htmlToStructuredText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  return normalizeWhitespace(renderNode(document.body as unknown as DomNode));
}

// Readability drops navigation, ads and other page chrome. When it can't find an
// article (short pages, portfolio landing pages), fall back to the whole body
// with chrome tags skipped by the renderer.
export function extractMainContent(html: string): ExtractedContent {
  const { document } = parseHTML(html);
  const pageTitle = document.title?.trim() || null;

  const article = new Readability(document.cloneNode(true) as unknown as Document, {
    charThreshold: 200,
  }).parse();

  if (article?.content) {
    return {
      title: article.title?.trim() || pageTitle,
      text: htmlToStructuredText(article.content),
    };
  }
  return {
    title: pageTitle,
    text: normalizeWhitespace(renderNode(document.body as unknown as DomNode)),
  };
}

const CV_SECTION_NAMES = new Set([
  "summary", "profile", "about", "about me", "experience", "work experience",
  "professional experience", "employment", "projects", "selected projects", "skills",
  "technical skills", "education", "certifications", "languages", "publications", "awards",
  "contact", "interests",
]);

// PDF text has no markup, so known CV section names and short ALL-CAPS lines are
// promoted to headings to give the chunker section boundaries.
export function markPlainTextHeadings(text: string): string {
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim().replace(/:$/, "");
      if (trimmed.length === 0 || trimmed.length > 40) return line;
      const isKnownSection = CV_SECTION_NAMES.has(trimmed.toLowerCase());
      const isAllCaps = /^[A-Z][A-Z &/-]{2,}$/.test(trimmed);
      return isKnownSection || isAllCaps ? `\n## ${trimmed}\n` : line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
