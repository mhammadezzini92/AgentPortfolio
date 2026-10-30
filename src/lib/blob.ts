import "server-only";
import { del, get, put } from "@vercel/blob";
import { blobEnv } from "@/lib/env";

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

// CVs are personal documents, so they're stored private and never served by public URL.
export async function storeSourceFile(input: StoreSourceFileInput): Promise<string> {
  const pathname = `sources/${input.sourceId}/${toSafeFileName(input.fileName)}`;
  try {
    const stored = await put(pathname, input.body, {
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
    await del(pathname, { token: blobEnv().BLOB_READ_WRITE_TOKEN });
  } catch (error) {
    throw new Error(`Failed to delete blob ${pathname}`, { cause: error });
  }
}
