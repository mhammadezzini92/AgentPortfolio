import { type Node, parse } from "acorn";
import { parseHTML } from "linkedom";

// Client-rendered sites often keep their content in a plain data object inside a script
// (const content = { projects: [...] }). This reads such literals from the syntax tree and
// renders them as heading-structured text. Nothing is executed: only object, array and
// string literals are read; functions, calls and variables are skipped.

const MAX_HEADING_DEPTH = 6;
const MAX_OUTPUT_CHARS = 60_000;
const TITLE_KEYS = ["name", "title", "company", "label", "role", "heading"];
const SKIPPED_KEYS = new Set(["id", "slug", "key", "icon", "photo", "image", "avatar", "logo"]);
const ASSET_PATTERN = /\.(png|jpe?g|gif|svg|webp|ico|pdf|mp4|webm)(\?.*)?$/i;
const LONG_ITEM_CHARS = 60;

// The acorn AST is ESTree; only the handful of fields read below are typed.
type AstNode = Node & {
  type: string;
  value?: unknown;
  key?: AstNode;
  name?: string;
  computed?: boolean;
  properties?: AstNode[];
  elements?: (AstNode | null)[];
  expressions?: AstNode[];
  quasis?: { value: { cooked?: string | null } }[];
};

type Scalar = string | number | boolean;

export function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scalarOf(node: AstNode | null | undefined): Scalar | null {
  if (!node) return null;
  if (node.type === "Literal" && ["string", "number", "boolean"].includes(typeof node.value)) return node.value as Scalar;
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) return node.quasis?.[0]?.value.cooked ?? null;
  return null;
}

function keyName(property: AstNode): string | null {
  if (property.type !== "Property" || property.computed || !property.key) return null;
  if (property.key.type === "Identifier") return property.key.name ?? null;
  const literal = scalarOf(property.key);
  return literal === null ? null : String(literal);
}

function usefulScalar(value: Scalar): boolean {
  return typeof value !== "string" || (value.trim() !== "" && !ASSET_PATTERN.test(value.trim()));
}

function heading(depth: number, text: string): string {
  return `${"#".repeat(Math.min(depth, MAX_HEADING_DEPTH))} ${text}`;
}

function renderArray(label: string, node: AstNode, depth: number): string[] {
  const elements = (node.elements ?? []).filter((element): element is AstNode => element !== null);
  const scalars = elements.map(scalarOf);
  if (scalars.every((value) => value !== null)) {
    const values = (scalars as Scalar[]).filter(usefulScalar).map(String);
    if (values.length === 0) return [];
    const long = values.some((value) => value.length > LONG_ITEM_CHARS);
    return long ? [`${label}:`, ...values.map((value) => `- ${value}`), ""] : [`${label}: ${values.join(", ")}`];
  }
  const lines = [heading(depth, label), ""];
  elements.forEach((element, index) => {
    if (element.type === "ObjectExpression") lines.push(...renderObject(titleOf(element) ?? `${label} ${index + 1}`, element, depth + 1));
    else if (element.type === "ArrayExpression") lines.push(...renderArray(`${label} ${index + 1}`, element, depth + 1));
  });
  return lines;
}

// Headings follow TITLE_KEYS priority, not property order; a role is paired with its
// company ("Lead at Acme") so experience sections stay identifiable on their own.
function titleOf(node: AstNode): string | null {
  const candidates = new Map<string, string>();
  for (const property of node.properties ?? []) {
    const name = keyName(property);
    const value = scalarOf(property.value as AstNode);
    if (name && TITLE_KEYS.includes(name) && typeof value === "string" && value.trim()) candidates.set(name, value.trim());
  }
  const company = candidates.get("company");
  const role = candidates.get("role");
  if (company && role && !candidates.has("name") && !candidates.has("title")) return `${role} at ${company}`;
  return TITLE_KEYS.map((key) => candidates.get(key)).find(Boolean) ?? null;
}

// Scalars become "Label: value" lines under the object's heading; nested objects and
// arrays become sub-sections, so the chunker can split along the data's own structure.
function renderObject(label: string, node: AstNode, depth: number): string[] {
  const lines = [heading(depth, label), ""];
  const nested: string[] = [];
  for (const property of node.properties ?? []) {
    const name = keyName(property);
    if (!name || SKIPPED_KEYS.has(name)) continue;
    const value = property.value as AstNode;
    const scalar = scalarOf(value);
    if (scalar !== null) {
      if (usefulScalar(scalar)) lines.push(`${humanizeKey(name)}: ${scalar}`);
    } else if (value.type === "ArrayExpression") {
      const rendered = renderArray(humanizeKey(name), value, depth + 1);
      (rendered[0]?.startsWith("#") ? nested : lines).push(...rendered);
    } else if (value.type === "ObjectExpression") {
      nested.push(...renderObject(humanizeKey(name), value, depth + 1));
    }
  }
  return [...lines, "", ...nested];
}

type StatementNode = AstNode & {
  declaration?: StatementNode | null;
  declarations?: { id?: AstNode; init?: AstNode | null }[];
  expression?: AstNode & { left?: AstNode & { property?: AstNode }; right?: AstNode };
};

function topLevelData(program: AstNode & { body?: StatementNode[] }): { label: string; node: AstNode }[] {
  const found: { label: string; node: AstNode }[] = [];
  const isData = (node: AstNode | null | undefined): node is AstNode => node?.type === "ObjectExpression" || node?.type === "ArrayExpression";

  for (const statement of program.body ?? []) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations ?? []) {
        if (declarator.id?.type === "Identifier" && declarator.id.name && isData(declarator.init)) {
          found.push({ label: humanizeKey(declarator.id.name), node: declarator.init });
        }
      }
    } else if (statement.type === "ExportDefaultDeclaration" && isData(statement.declaration)) {
      found.push({ label: "Content", node: statement.declaration });
    } else if (statement.type === "ExpressionStatement" && statement.expression?.type === "AssignmentExpression" && isData(statement.expression.right)) {
      const target = statement.expression.left;
      const name = target?.type === "MemberExpression" ? target.property?.name : target?.name;
      if (name) found.push({ label: humanizeKey(name), node: statement.expression.right });
    }
  }
  return found;
}

function parseScript(source: string): AstNode | null {
  for (const sourceType of ["module", "script"] as const) {
    try {
      return parse(source, { ecmaVersion: "latest", sourceType, allowHashBang: true }) as AstNode;
    } catch {
      // Not valid in this mode; try the other one, then give up (minified or non-JS input).
    }
  }
  return null;
}

export function scriptDataToText(source: string): string {
  const program = parseScript(source);
  if (!program) return "";

  const sections = topLevelData(program).map(({ label, node }) =>
    (node.type === "ObjectExpression" ? renderObject(label, node, 1) : renderArray(label, node, 1)).join("\n"),
  );
  const text = sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > MAX_OUTPUT_CHARS ? text.slice(0, MAX_OUTPUT_CHARS) : text;
}

// Same-origin only: third-party scripts are libraries and trackers, not the site's content.
export function findSameOriginScripts(html: string, pageUrl: URL, limit: number): URL[] {
  const { document } = parseHTML(html);
  const urls: URL[] = [];
  for (const script of document.querySelectorAll("script[src]")) {
    try {
      const url = new URL(script.getAttribute("src") ?? "", pageUrl);
      if (url.origin === pageUrl.origin && !urls.some((existing) => existing.href === url.href)) urls.push(url);
    } catch {
      // An unparseable src attribute can't be fetched anyway.
    }
    if (urls.length >= limit) break;
  }
  return urls;
}
