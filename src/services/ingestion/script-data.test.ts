import { describe, expect, it } from "vitest";
import { chunkDocument } from "@/services/ingestion/chunker";
import { findSameOriginScripts, humanizeKey, scriptDataToText } from "@/services/ingestion/script-data";

const PORTFOLIO_SCRIPT = `
const portfolioContent = {
  profile: { name: "Jane Doe", title: "Backend Engineer", photo: "assets/jane.jpg", id: "jane" },
  caseStudies: [
    {
      id: "ledger",
      name: "Ledger",
      role: "Tech Lead",
      technologies: ["Go", "Kafka"],
      owned: ["Designed the double-entry model and the reconciliation jobs end to end."],
    },
  ],
  experience: [{ role: "Engineer", company: "Acme", period: \`2020 - 2024\` }],
};
function render() { document.body.innerHTML = portfolioContent.profile.name; }
window.siteConfig = { theme: "dark" };
`;

describe("scriptDataToText", () => {
  it("renders data literals as heading-structured text the chunker can split", () => {
    const text = scriptDataToText(PORTFOLIO_SCRIPT);

    expect(text).toContain("# Portfolio content");
    expect(text).toContain("## Profile\n\nName: Jane Doe\nTitle: Backend Engineer");
    expect(text).toContain("### Ledger\n\nName: Ledger\nRole: Tech Lead\nTechnologies: Go, Kafka\nOwned:\n- Designed the double-entry model");
    expect(text).toContain("### Engineer at Acme");
    expect(text).toContain("Period: 2020 - 2024");
    expect(text).toContain("# Site config\n\nTheme: dark");

    const headings = chunkDocument(text).map((chunk) => chunk.headingPath.join(" > "));
    expect(headings).toContain("Portfolio content > Case studies > Ledger");
  });

  it("skips ids, asset paths and anything that isn't a literal", () => {
    const text = scriptDataToText(PORTFOLIO_SCRIPT);
    expect(text).not.toContain("jane.jpg");
    expect(text).not.toContain("Id:");
    expect(text).not.toContain("innerHTML");
  });

  it("never executes code and ignores computed or dynamic values", () => {
    const text = scriptDataToText(`
      const data = { safe: "kept", [dynamicKey]: "dropped", fromCall: compute(), tpl: \`a \${b}\` };
      globalThis.pwned = true;
    `);
    expect(text).toBe("# Data\n\nSafe: kept");
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined();
  });

  it("returns an empty string for code without data and for unparseable input", () => {
    expect(scriptDataToText("function a() { return 1; }")).toBe("");
    expect(scriptDataToText("<html>not javascript")).toBe("");
  });

  it("reads exported data in modules", () => {
    expect(scriptDataToText('export const projects = [{ name: "Atlas", summary: "A map tool" }];')).toContain("## Atlas\n\nName: Atlas\nSummary: A map tool");
  });
});

describe("humanizeKey", () => {
  it("turns camelCase and snake_case keys into labels", () => {
    expect(humanizeKey("caseStudies")).toBe("Case studies");
    expect(humanizeKey("proof_points")).toBe("Proof points");
  });
});

describe("findSameOriginScripts", () => {
  it("keeps same-origin scripts only, resolved against the page, deduplicated and capped", () => {
    const html = `
      <script src="content.js"></script>
      <script src="/content.js"></script>
      <script src="https://cdn.example.net/lib.js"></script>
      <script src="//tracker.example.org/t.js"></script>
      <script>inline()</script>
      <script src="/js/app.js"></script>
      <script src="/js/extra.js"></script>`;
    const urls = findSameOriginScripts(html, new URL("https://jane.dev/"), 2);
    expect(urls.map(String)).toEqual(["https://jane.dev/content.js", "https://jane.dev/js/app.js"]);
  });
});
