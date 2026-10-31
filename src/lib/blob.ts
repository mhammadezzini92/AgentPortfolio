import "server-only";
import { randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { blobEnv } from "@/lib/env";
import {
  LOCAL_PATH_PREFIX,
  deleteLocalFile,
  readLocalFile,
  writeLocalFile,
} from "@/lib/local-file-store";

type StoreSourceFileInput = {
  sourceId: number;
  fileName: string;
  body: Blob | Buffer;
  contentType: string;
};

// The file name comes from the uploader, so it's reduced to a safe charset before it becomes a path.
function toSafeFileName(fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.slice(-120) || "file";
}

// Lets the dashboard run locally without a Vercel Blob store. Limited to development so a
// missing token in production still fails loudly instead of writing to an ephemeral disk.
function usesLocalStore(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.BLOB_READ_WRITE_TOKEN;
}

function isLocalPath(storagePath: string): boolean {
  return storagePath.startsWith(LOCAL_PATH_PREFIX);
}

// CVs are personal documents, so they're stored private and never served by public URL.
export async function storeSourceFile(input: StoreSourceFileInput): Promise<string> {
  const folder = `sources/${input.sourceId}`;
  const safeName = toSafeFileName(input.fileName);
  try {
    if (usesLocalStore()) {
      return await writeLocalFile(`${folder}/${randomBytes(6).toString("hex")}-${safeName}`, input.body);
    }
    const stored = await put(`${folder}/${safeName}`, input.body, {
      access: "private",
      contentType: input.contentType,
      addRandomSuffix: true,
      token: blobEnv().BLOB_READ_WRITE_TOKEN,
    });
    return stored.pathname;
  } catch (error) {
    throw new Error(`Failed to store file for source ${input.sourceId}`, { cause: error });
  }
}

export async function readSourceFile(pathname: string): Promise<Uint8Array> {
  if (isLocalPath(pathname)) {
    return readLocalFile(pathname).catch((error: unknown) => {
      throw new Error(`Failed to read local file ${pathname}`, { cause: error });
    });
  }

  const found = await get(pathname, {
    access: "private",
    token: blobEnv().BLOB_READ_WRITE_TOKEN,
  }).catch((error: unknown) => {
    throw new Error(`Failed to read blob ${pathname}`, { cause: error });
  });
  if (!found) throw new Error(`Blob ${pathname} not found`);

  return new Uint8Array(await new Response(found.stream).arrayBuffer());
}

export async function deleteSourceFile(pathname: string): Promise<void> {
  try {
    if (isLocalPath(pathname)) {
      await deleteLocalFile(pathname);
      return;
    }
    await del(pathname, { token: blobEnv().BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    throw new Error(`Failed to delete stored file ${pathname}`, { cause: error });
  }
}
