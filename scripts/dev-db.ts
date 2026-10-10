import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
await mkdir("data/mongo", { recursive: true });
const mongo = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    dbPath: path.resolve("data/mongo"),
    storageEngine: "wiredTiger",
  },
  binary: { version: "8.0.14" },
});
console.log(
  `Local MongoDB running at ${mongo.getUri()} (data/mongo persists across restarts)`,
);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    await mongo.stop({ doCleanup: false });
    process.exit(0);
  });
