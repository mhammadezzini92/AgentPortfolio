import { describe, expect, it } from "vitest";
import {
  extractMainContent,
  htmlToStructuredText,
  markPlainTextHeadings,
} from "@/services/ingestion/content-extractor";

describe("htmlToStructuredText", () => {
  it("keeps headings, lists and code, and drops scripts and images", () => {
    const html = `
      <h1>Payments Platform</h1>
      <p>Built with <code>Go</code> and Kafka.</p>
      <script>alert(1)</script><img src="x.png">
      <ul><li>Idempotent writes</li><li>Exactly-once consumers</li></ul>
      <pre>func main() {\n  run()\n}</pre>`;

    expect(htmlToStructuredText(html)).toBe(
      "# Payments Platform\n\nBuilt with `Go` and Kafka.\n\n- Idempotent writes\n- Exactly-once consumers\n\n```\nfunc main() {\n  run()\n}\n```",
    );
  });
});

describe("extractMainContent", () => {
  it("drops navigation and footer chrome", () => {
    const body = "<p>" + "I designed the settlement engine for a fintech startup. ".repeat(10) + "</p>";
    const html = `<html><head><title>Case study</title></head><body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <article><h2>Settlement engine</h2>${body}</article>
      <footer>© 2026 All rights reserved</footer>
    </body></html>`;

    const { title, text } = extractMainContent(html);
    expect(title).toBe("Case study");
    expect(text).toContain("## Settlement engine");
    expect(text).toContain("settlement engine for a fintech startup");
    expect(text).not.toContain("All rights reserved");
    expect(text).not.toMatch(/\bAbout\b/);
  });
});

describe("markPlainTextHeadings", () => {
  it("promotes CV section names and short all-caps lines", () => {
    const text = "Jane Doe\nExperience\nAcme Corp, Engineer\nTECHNICAL SKILLS\nGo, SQL";
    expect(markPlainTextHeadings(text)).toBe(
      "Jane Doe\n\n## Experience\n\nAcme Corp, Engineer\n\n## TECHNICAL SKILLS\n\nGo, SQL",
    );
  });

  it("leaves long lines alone even when they start with a section word", () => {
    const line = "Experience building distributed systems at scale for over ten years";
    expect(markPlainTextHeadings(line)).toBe(line);
  });
});
