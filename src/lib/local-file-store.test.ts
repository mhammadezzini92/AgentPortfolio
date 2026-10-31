import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const tempRoot = mkdtempSync(path.join(tmpdir(), "local-file-store-"));
vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
const { deleteLocalFile, readLocalFile, writeLocalFile } = await import("@/lib/local-file-store");

afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("local file store", () => {
  it("writes, reads back and deletes a file under .uploads", async () => {
    const storagePath = await writeLocalFile("sources/1/abc-cv.pdf", Buffer.from("%PDF-1.7"));
    expect(storagePath).toBe("local:sources/1/abc-cv.pdf");

    expect(Buffer.from(await readLocalFile(storagePath)).toString()).toBe("%PDF-1.7");

    await deleteLocalFile(storagePath);
    await expect(readLocalFile(storagePath)).rejects.toThrow();
  });

  it("refuses paths that escape the uploads folder", async () => {
    await expect(writeLocalFile("../outside.txt", Buffer.from("x"))).rejects.toThrow(/escapes/);
    await expect(readLocalFile("local:../../etc/passwd")).rejects.toThrow(/escapes/);
  });
});
