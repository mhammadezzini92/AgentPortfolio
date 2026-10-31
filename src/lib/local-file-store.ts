import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Stored paths carry this prefix so reads and deletes go back to the disk even if a Blob
// token is configured later.
export const LOCAL_PATH_PREFIX = "local:";

const UPLOADS_ROOT = path.join(process.cwd(), ".uploads");

function resolveInsideRoot(storagePath: string): string {
  const absolute = path.resolve(UPLOADS_ROOT, storagePath.slice(LOCAL_PATH_PREFIX.length));
  if (!absolute.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error(`Local storage path escapes the uploads folder: ${storagePath}`);
  }
  return absolute;
}

export async function writeLocalFile(relativePath: string, body: Blob | Buffer): Promise<string> {
  const storagePath = `${LOCAL_PATH_PREFIX}${relativePath}`;
  const absolute = resolveInsideRoot(storagePath);
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer());
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return storagePath;
}

export async function readLocalFile(storagePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolveInsideRoot(storagePath)));
}

export async function deleteLocalFile(storagePath: string): Promise<void> {
  await rm(resolveInsideRoot(storagePath), { force: true });
}
