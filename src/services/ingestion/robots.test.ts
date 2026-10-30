import { describe, expect, it } from "vitest";
import { ALLOW_ALL, DISALLOW_ALL, isPathAllowed, parseRobots } from "@/services/ingestion/robots";

describe("robots", () => {
  it("applies the wildcard group when no specific group exists", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /private\n");
    expect(isPathAllowed(policy, "/private/cv.pdf")).toBe(false);
    expect(isPathAllowed(policy, "/blog")).toBe(true);
  });

  it("prefers a group naming our crawler over the wildcard group", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: AgentPortfolioBot\nDisallow: /admin\n");
    expect(isPathAllowed(policy, "/blog")).toBe(true);
    expect(isPathAllowed(policy, "/admin")).toBe(false);
  });

  it("uses the longest match, with Allow winning ties", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /docs\nAllow: /docs/public\nDisallow: /same\nAllow: /same\n");
    expect(isPathAllowed(policy, "/docs/internal")).toBe(false);
    expect(isPathAllowed(policy, "/docs/public/page")).toBe(true);
    expect(isPathAllowed(policy, "/same")).toBe(true);
  });

  it("supports * and $ patterns", () => {
    const policy = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?session=\n");
    expect(isPathAllowed(policy, "/files/cv.pdf")).toBe(false);
    expect(isPathAllowed(policy, "/files/cv.pdf.html")).toBe(true);
    expect(isPathAllowed(policy, "/page?session=1")).toBe(false);
  });

  it("treats an empty Disallow as allow-all and shares rules across stacked agents", () => {
    const policy = parseRobots("User-agent: foo\nUser-agent: *\nDisallow:\n");
    expect(isPathAllowed(policy, "/anything")).toBe(true);
  });

  it("exposes allow-all and disallow-all policies for missing or unreachable files", () => {
    expect(isPathAllowed(ALLOW_ALL, "/x")).toBe(true);
    expect(isPathAllowed(DISALLOW_ALL, "/x")).toBe(false);
  });
});
