import { MongoClient, type Document } from "mongodb";
import { randomUUID } from "node:crypto";
const globalDb = globalThis as unknown as {
  marginMongo?: Promise<MongoClient>;
};
export async function db() {
  if (!globalDb.marginMongo)
    globalDb.marginMongo = new MongoClient(
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
      { serverSelectionTimeoutMS: 5000 },
    )
      .connect()
      .catch((e) => {
        globalDb.marginMongo = undefined;
        throw e;
      });
  const client = await globalDb.marginMongo;
  return client.db(process.env.MONGODB_DB || "research_workspace");
}
export async function col<T extends Document = Document>(name: string) {
  return (await db()).collection<T>(name);
}
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export async function indexes() {
  const database = await db();
  await Promise.all([
    database
      .collection("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database
      .collection("sessions")
      .createIndex({ tokenHash: 1 }, { unique: true }),
    database
      .collection("memberships")
      .createIndex({ teamId: 1, identityId: 1 }, { unique: true }),
    database
      .collection("papers")
      .createIndex({ libraryId: 1, deleted: 1, updatedAt: -1 }),
    database
      .collection("papers")
      .createIndex({ title: "text", abstract: "text", authors: "text" }),
    database
      .collection("pages")
      .createIndex({ paperId: 1, pageIndex: 1 }, { unique: true }),
    database.collection("jobs").createIndex({ state: 1, leaseUntil: 1 }),
    database
      .collection("reading")
      .createIndex({ paperId: 1, identityId: 1 }, { unique: true }),
    database
      .collection("rateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
