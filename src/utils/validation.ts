import { BlockList, isIP } from "node:net";
import { z } from "zod";
import {
  ENTITY_TYPES,
  PROCESSING_STATUSES,
  PROVENANCES,
  SOURCE_TYPES,
} from "@/models/schemas";

export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const processingStatusSchema = z.enum(PROCESSING_STATUSES);
export const provenanceSchema = z.enum(PROVENANCES);
export const entityTypeSchema = z.enum(ENTITY_TYPES);

export const partialDateSchema = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "Expected YYYY or YYYY-MM");

export const languageSchema = z.object({
  name: z.string().min(1),
  proficiency: z.string().min(1).optional(),
});

export const educationSchema = z.object({
  institution: z.string().min(1),
  degree: z.string().min(1).optional(),
  field: z.string().min(1).optional(),
  startDate: partialDateSchema.optional(),
  endDate: partialDateSchema.optional(),
});

export const contactInformationSchema = z.object({
  email: z.email().optional(),
  phone: z.string().optional(),
  website: z.url().optional(),
  linkedin: z.url().optional(),
  github: z.url().optional(),
});

export type Language = z.infer<typeof languageSchema>;
export type Education = z.infer<typeof educationSchema>;
export type ContactInformation = z.infer<typeof contactInformationSchema>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const uploadFileSchema = z
  .file()
  .min(1, "File is empty")
  .max(MAX_UPLOAD_BYTES, "File exceeds 10MB")
  .mime([PDF_MIME, DOCX_MIME]);

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // DOCX is a zip container

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

export function detectDocumentMime(bytes: Uint8Array): typeof PDF_MIME | typeof DOCX_MIME | null {
  if (startsWith(bytes, PDF_SIGNATURE)) return PDF_MIME;
  if (startsWith(bytes, ZIP_SIGNATURE)) return DOCX_MIME;
  return null;
}

// The browser-supplied MIME type is client-controlled, so the leading bytes must agree with it.
export function hasExpectedFileSignature(bytes: Uint8Array, mimeType: string): boolean {
  return detectDocumentMime(bytes) === mimeType;
}

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

// IPv6 is allowlisted to global unicast, minus ranges that tunnel to or embed IPv4 addresses.
const globalUnicastIpv6 = new BlockList();
globalUnicastIpv6.addSubnet("2000::", 3, "ipv6");

const blockedIpv6 = new BlockList();
blockedIpv6.addSubnet("2001::", 32, "ipv6"); // Teredo
blockedIpv6.addSubnet("2001:db8::", 32, "ipv6"); // documentation
blockedIpv6.addSubnet("2002::", 16, "ipv6"); // 6to4

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blockedIpv4.check(address, "ipv4");
  if (version === 6) {
    return globalUnicastIpv6.check(address, "ipv6") && !blockedIpv6.check(address, "ipv6");
  }
  return false;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isAllowedHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) return isPublicIpAddress(host);
  if (host === "localhost" || !host.includes(".")) return false;
  return !BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

// Syntactic SSRF guard only. The fetcher must still resolve DNS and run
// isPublicIpAddress on every resolved address, including after each redirect.
export const publicHttpUrlSchema = z
  .url({ protocol: /^https?$/ })
  .transform((raw) => new URL(raw))
  .refine((url) => !url.username && !url.password, "URLs with credentials are not allowed")
  .refine((url) => url.port === "", "Only default ports are allowed")
  .refine((url) => isAllowedHostname(url.hostname), "Host is not publicly routable");
