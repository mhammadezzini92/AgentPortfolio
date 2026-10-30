import { describe, expect, it } from "vitest";
import {
  DOCX_MIME,
  PDF_MIME,
  hasExpectedFileSignature,
  isPublicIpAddress,
  publicHttpUrlSchema,
  uploadFileSchema,
} from "@/utils/validation";

describe("isPublicIpAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "2002:7f00:1::", "2001:db8::1", "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("accepts %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });
});

describe("publicHttpUrlSchema", () => {
  it.each([
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://intranet/",
    "http://printer.local/",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
  ])("rejects %s", (url) => {
    expect(publicHttpUrlSchema.safeParse(url).success).toBe(false);
  });

  it.each(["https://example.com/post", "http://example.com:80/", "https://8.8.8.8/"])("accepts %s", (url) => {
    expect(publicHttpUrlSchema.safeParse(url).success).toBe(true);
  });
});

describe("upload guards", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7 ...");
  const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]);

  it("requires the leading bytes to match the declared type", () => {
    expect(hasExpectedFileSignature(pdfBytes, PDF_MIME)).toBe(true);
    expect(hasExpectedFileSignature(zipBytes, DOCX_MIME)).toBe(true);
    expect(hasExpectedFileSignature(zipBytes, PDF_MIME)).toBe(false);
    expect(hasExpectedFileSignature(new Uint8Array([0x25]), PDF_MIME)).toBe(false);
  });

  it("rejects disallowed types and oversized files", () => {
    expect(uploadFileSchema.safeParse(new File(["x"], "a.exe", { type: "application/x-msdownload" })).success).toBe(false);
    expect(uploadFileSchema.safeParse(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.pdf", { type: PDF_MIME })).success).toBe(false);
    expect(uploadFileSchema.safeParse(new File(["%PDF-"], "a.pdf", { type: PDF_MIME })).success).toBe(true);
  });
});
