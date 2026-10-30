// Minimal RFC 9309 robots.txt handling: user-agent groups, Allow/Disallow with
// "*" and "$" patterns, longest match wins, Allow wins ties.

export const CRAWLER_USER_AGENT = "AgentPortfolioBot/1.0";
const CRAWLER_TOKEN = "agentportfoliobot";

type Rule = { allow: boolean; pattern: string; matcher: RegExp };
type Group = { agents: string[]; rules: Rule[] };

function toMatcher(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function parseGroups(body: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastLineWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    // An empty Disallow means "allow everything" and adds no rule.
    if (value === "") continue;
    current.rules.push({ allow: field === "allow", pattern: value, matcher: toMatcher(value) });
  }
  return groups;
}

export type RobotsPolicy = { rules: Rule[] };

export function parseRobots(body: string): RobotsPolicy {
  const groups = parseGroups(body);
  const specific = groups.filter((group) => group.agents.some((agent) => agent === CRAWLER_TOKEN));
  const selected = specific.length > 0 ? specific : groups.filter((group) => group.agents.includes("*"));
  return { rules: selected.flatMap((group) => group.rules) };
}

export const ALLOW_ALL: RobotsPolicy = { rules: [] };
export const DISALLOW_ALL: RobotsPolicy = { rules: [{ allow: false, pattern: "/", matcher: /^\// }] };

export function isPathAllowed(policy: RobotsPolicy, pathWithQuery: string): boolean {
  let best: Rule | null = null;
  for (const rule of policy.rules) {
    if (!rule.matcher.test(pathWithQuery)) continue;
    const longer = !best || rule.pattern.length > best.pattern.length;
    const tieWonByAllow = best && rule.pattern.length === best.pattern.length && rule.allow;
    if (longer || tieWonByAllow) best = rule;
  }
  return best?.allow ?? true;
}
