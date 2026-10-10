import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
export interface StorageProvider {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  size(key: string): Promise<number>;
  remove(key: string): Promise<void>;
}
class LocalStorage implements StorageProvider {
  root = path.resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "data/uploads",
  );
  resolve(key: string) {
    if (!/^[a-f0-9]{64}\.pdf$/.test(key))
      throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, bytes: Buffer) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.resolve(key), bytes, { flag: "wx" }).catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async size(key: string) {
    return (await stat(this.resolve(key))).size;
  }
  async remove(key: string) {
    await unlink(this.resolve(key));
  }
}
export const storage: StorageProvider = new LocalStorage();
