import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

export interface GuardStore {
  create(pathname: string, value: unknown): Promise<boolean>;
  read<T>(pathname: string): Promise<T | null>;
  list(prefix: string): Promise<string[]>;
  remove(pathname: string): Promise<void>;
}

function rootDir(): string {
  return process.env.GUARD_STORE_DIR || path.join(process.cwd(), ".guard");
}

function safePath(pathname: string): string {
  if (pathname.includes("..") || path.isAbsolute(pathname)) {
    throw new Error("invalid guard pathname");
  }
  return path.join(rootDir(), pathname);
}

async function walk(directory: string, relative = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const output: string[] = [];
  for (const entry of entries) {
    const childRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walk(path.join(directory, entry.name), childRelative)));
    } else {
      output.push(childRelative);
    }
  }
  return output;
}

export const fileGuardStore: GuardStore = {
  async create(pathname, value) {
    const filename = safePath(pathname);
    await mkdir(path.dirname(filename), { recursive: true });
    try {
      const handle = await open(filename, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(value));
        await handle.sync();
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  },
  async read<T>(pathname: string) {
    try {
      return JSON.parse(await readFile(safePath(pathname), "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },
  async list(prefix) {
    return (await walk(rootDir())).filter((entry) => entry.startsWith(prefix));
  },
  async remove(pathname) {
    try {
      await unlink(safePath(pathname));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
};
