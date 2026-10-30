import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { isPublicIpAddress, publicHttpUrlSchema } from "@/utils/validation";
import {
  ALLOW_ALL,
  CRAWLER_USER_AGENT,
  DISALLOW_ALL,
  type RobotsPolicy,
  isPathAllowed,
  parseRobots,
} from "@/services/ingestion/robots";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 512 * 1024;

const DOCUMENT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/pdf",
];

export type FetchedDocument = { finalUrl: URL; contentType: string; body: Buffer };

type RawResponse = { status: number; location: string | null; contentType: string; body: Buffer };

export class FetchBlockedError extends Error {}

// Validates every resolved address at connect time. Checking the hostname before the
// request isn't enough: DNS could answer differently on the second lookup (rebinding).
// Node skips lookup for IP-literal hosts; publicHttpUrlSchema already rejects private literals.
const publicOnlyLookup = ((hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((entry) => !isPublicIpAddress(entry.address))) {
      return callback(new FetchBlockedError(`${hostname} resolves to a non-public address`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as LookupFunction;

function requestOnce(url: URL, allowedTypes: string[], maxBytes: number): Promise<RawResponse> {
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        lookup: publicOnlyLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": CRAWLER_USER_AGENT,
          accept: allowedTypes.join(", "),
          "accept-encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = response.headers["content-type"] ?? "";
        const location = response.headers.location ?? null;

        if (status >= 300 && status < 400 && location) {
          response.resume();
          return resolve({ status, location, contentType, body: Buffer.alloc(0) });
        }
        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({ status, location: null, contentType, body: Buffer.alloc(0) });
        }

        const mime = contentType.split(";")[0].trim().toLowerCase();
        if (!allowedTypes.includes(mime)) {
          response.destroy();
          return reject(new FetchBlockedError(`Unsupported content type "${mime}" at ${url}`));
        }
        if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
          response.destroy();
          return reject(new FetchBlockedError(`Response from ${url} exceeds ${maxBytes} bytes`));
        }

        const parts: Buffer[] = [];
        let received = 0;
        response.on("data", (part: Buffer) => {
          received += part.length;
          if (received > maxBytes) {
            response.destroy(new FetchBlockedError(`Response from ${url} exceeds ${maxBytes} bytes`));
            return;
          }
          parts.push(part);
        });
        response.on("end", () => resolve({ status, location: null, contentType, body: Buffer.concat(parts) }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error(`Timed out fetching ${url}`)));
    request.on("error", reject);
  });
}

async function followRedirects(
  startUrl: URL,
  allowedTypes: string[],
  maxBytes: number,
  beforeEachHop: (url: URL) => Promise<void>,
): Promise<RawResponse & { finalUrl: URL }> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await beforeEachHop(url);
    const response = await requestOnce(url, allowedTypes, maxBytes);
    if (!response.location) return { ...response, finalUrl: url };

    const next = publicHttpUrlSchema.safeParse(new URL(response.location, url).toString());
    if (!next.success) throw new FetchBlockedError(`Redirect from ${url} to a disallowed URL`);
    url = next.data;
  }
  throw new FetchBlockedError(`Too many redirects starting at ${startUrl}`);
}

// RFC 9309: a missing robots.txt (4xx) allows everything; an unreachable one (5xx,
// network error) means we must assume everything is disallowed.
async function loadRobotsPolicy(origin: URL): Promise<RobotsPolicy> {
  try {
    const response = await followRedirects(new URL("/robots.txt", origin), ["text/plain"], MAX_ROBOTS_BYTES, async () => {});
    if (response.status >= 200 && response.status < 300) return parseRobots(response.body.toString("utf-8"));
    if (response.status >= 400 && response.status < 500) return ALLOW_ALL;
    return DISALLOW_ALL;
  } catch (error) {
    // A blocked address is an SSRF rejection, not a robots outcome; report it as such.
    if (error instanceof FetchBlockedError) throw error;
    return DISALLOW_ALL;
  }
}

export async function fetchPublicDocument(rawUrl: string): Promise<FetchedDocument> {
  const parsed = publicHttpUrlSchema.safeParse(rawUrl);
  if (!parsed.success) throw new FetchBlockedError(`URL is not allowed: ${rawUrl}`);

  const robotsByOrigin = new Map<string, RobotsPolicy>();
  const assertCrawlable = async (url: URL) => {
    let policy = robotsByOrigin.get(url.origin);
    if (!policy) {
      policy = await loadRobotsPolicy(url);
      robotsByOrigin.set(url.origin, policy);
    }
    if (!isPathAllowed(policy, url.pathname + url.search)) {
      throw new FetchBlockedError(`robots.txt disallows fetching ${url}`);
    }
  };

  const response = await followRedirects(parsed.data, DOCUMENT_CONTENT_TYPES, MAX_BODY_BYTES, assertCrawlable);
  if (response.status === 401 || response.status === 402 || response.status === 403) {
    throw new FetchBlockedError(`${response.finalUrl} requires authentication or payment (HTTP ${response.status})`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Fetching ${response.finalUrl} failed with HTTP ${response.status}`);
  }
  return { finalUrl: response.finalUrl, contentType: response.contentType, body: response.body };
}
