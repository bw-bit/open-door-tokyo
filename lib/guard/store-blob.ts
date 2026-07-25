import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  list,
  put
} from "@vercel/blob";
import type { GuardStore } from "./store-file";

export const blobGuardStore: GuardStore = {
  async create(pathname, value) {
    try {
      await put(pathname, JSON.stringify(value), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json"
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        return false;
      }
      throw error;
    }
  },
  async read<T>(pathname: string) {
    try {
      const result = await get(pathname, { access: "private", useCache: false });
      if (!result || !result.stream) return null;
      return JSON.parse(await new Response(result.stream).text()) as T;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  },
  async list(prefix) {
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor });
      names.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return names;
  },
  async remove(pathname) {
    await del(pathname);
  }
};
