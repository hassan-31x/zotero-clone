import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { col } from "./db";
import type { Identity, Library, Paper } from "./types";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export async function identity(): Promise<Identity> {
  const token = (await cookies()).get("margin_session")?.value;
  if (!token)
    throw new AppError(
      401,
      "SESSION_REQUIRED",
      "Start a workspace to continue.",
    );
  const session = await (
    await col("sessions")
  ).findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } });
  if (!session)
    throw new AppError(
      401,
      "SESSION_EXPIRED",
      "Your session expired. Restore your identity or start a new workspace.",
    );
  const user = await (
    await col<Identity>("identities")
  ).findOne({ _id: session.identityId });
  if (!user) throw new AppError(401, "SESSION_REQUIRED", "Identity not found.");
  return user;
}
export async function scope(
  libraryId: string,
  userId: string,
  write = false,
): Promise<Library> {
  const library = await (
    await col<Library>("libraries")
  ).findOne({ _id: libraryId });
  if (!library) throw new AppError(404, "NOT_FOUND", "Library not found.");
  if (library.ownerId === userId) return { ...library, role: "owner" };
  if (library.teamId) {
    const member = await (
      await col("memberships")
    ).findOne({ teamId: library.teamId, identityId: userId });
    if (member && (!write || member.role !== "viewer"))
      return { ...library, role: member.role };
  }
  throw new AppError(
    403,
    "FORBIDDEN",
    "You do not have access to this library.",
  );
}
export async function paperScope(
  paperId: string,
  userId: string,
  write = false,
) {
  const paper = await (await col<Paper>("papers")).findOne({ _id: paperId });
  if (!paper) throw new AppError(404, "NOT_FOUND", "Paper not found.");
  const library = await scope(paper.libraryId, userId, write);
  return { paper, library };
}
export async function csrf(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  if (request.headers.get("host"))
    requestUrl.host = request.headers.get("host")!;
  const expected = requestUrl.origin;
  const configured = process.env.APP_URL;
  if (!origin || (origin !== expected && origin !== configured))
    throw new AppError(403, "CSRF", "Request origin is not allowed.");
}
export async function rateLimit(key: string, max: number, period = 3600000) {
  const bucket = Math.floor(Date.now() / period);
  const limits = await col("rateLimits");
  const result = await limits.findOneAndUpdate(
    { _id: `${hash(key)}:${bucket}` as any },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + period * 2) },
    },
    { upsert: true, returnDocument: "after" },
  );
  if ((result?.count || 0) > max)
    throw new AppError(
      429,
      "RATE_LIMIT",
      "Too many requests. Please try again later.",
    );
}
export async function clientKey() {
  const h = await headers();
  return process.env.TRUST_PROXY === "true"
    ? h.get("x-forwarded-for")?.split(",")[0] || "local"
    : "local";
}
export async function audit(
  userId: string,
  libraryId: string,
  action: string,
  detail: string,
) {
  await (
    await col("activity")
  ).insertOne({
    identityId: userId,
    libraryId,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}
export function canEditRecord(
  record: { identityId: string; shared?: boolean },
  userId: string,
) {
  return record.identityId === userId;
}
