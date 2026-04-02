import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_PROFILE_AVATAR_BYTES } from "@/lib/profile-avatar-limits";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Trim and ensure a URL scheme so `new URL()` works (values are often pasted without `https://`). */
export function normalizeSpacesEndpoint(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname) return null;
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return null;
  }
}

export function spacesRegionFromEndpoint(endpoint: string): string {
  const normalized = normalizeSpacesEndpoint(endpoint) ?? endpoint;
  try {
    const u = new URL(normalized);
    const h = u.hostname.toLowerCase();
    const m = /^([a-z0-9-]+)\.digitaloceanspaces\.com$/.exec(h);
    if (m?.[1]) return m[1];
  } catch {
    /* ignore */
  }
  return "us-east-1";
}

/** Public origin for objects (virtual-hosted style or CDN override); null if not configured. */
export function trySpacesPublicBaseUrl(): string | null {
  const override = process.env.DO_SPACES_PUBLIC_ORIGIN?.trim();
  if (override) return override.replace(/\/$/, "");
  const raw = process.env.DO_SPACES_ENDPOINT?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  if (!raw || !bucket) return null;
  const endpoint = normalizeSpacesEndpoint(raw);
  if (!endpoint) return null;
  try {
    const u = new URL(endpoint);
    return `https://${bucket}.${u.hostname}`;
  } catch {
    return null;
  }
}

/** Same as {@link trySpacesPublicBaseUrl} but throws when Spaces public base cannot be derived. */
export function spacesPublicBaseUrl(): string {
  const b = trySpacesPublicBaseUrl();
  if (b) return b;

  const raw = process.env.DO_SPACES_ENDPOINT?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  if (!raw || !bucket) {
    throw new Error(
      "DO_SPACES_ENDPOINT and DO_SPACES_BUCKET must be set and non-empty in the server environment. " +
        "If you use Docker Compose, put them in the project root `.env` (Compose does not load `.env.local` unless configured) and run `docker compose up -d --force-recreate web`. " +
        "On Vercel/hosted deploys, set the same variables in the platform’s env settings.",
    );
  }
  if (!normalizeSpacesEndpoint(raw)) {
    throw new Error(
      `DO_SPACES_ENDPOINT must be a valid URL or hostname (got ${JSON.stringify(raw)}). ` +
        "Example: https://blr1.digitaloceanspaces.com or blr1.digitaloceanspaces.com",
    );
  }
  throw new Error(
    "Could not build Spaces public URL from DO_SPACES_ENDPOINT and DO_SPACES_BUCKET.",
  );
}

/** S3 client for server-side Spaces ops; null if env incomplete (e.g. local dev without DO). */
export function trySpacesS3Client(): { client: S3Client; bucket: string } | null {
  const rawEndpoint = process.env.DO_SPACES_ENDPOINT?.trim();
  const bucket = process.env.DO_SPACES_BUCKET?.trim();
  const key = process.env.DO_SPACES_KEY?.trim();
  const secret = process.env.DO_SPACES_SECRET?.trim();
  if (!rawEndpoint || !bucket || !key || !secret) return null;
  const endpoint = normalizeSpacesEndpoint(rawEndpoint);
  if (!endpoint) return null;
  const region = spacesRegionFromEndpoint(endpoint);
  const client = new S3Client({
    region,
    endpoint,
    credentials: {
      accessKeyId: key,
      secretAccessKey: secret,
    },
    forcePathStyle: false,
  });
  return { client, bucket };
}

function requireSpacesEnv(): {
  client: S3Client;
  bucket: string;
  publicBase: string;
} {
  const t = trySpacesS3Client();
  if (!t) {
    throw new Error(
      "Missing DO Spaces env: DO_SPACES_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_KEY, DO_SPACES_SECRET",
    );
  }
  return { client: t.client, bucket: t.bucket, publicBase: spacesPublicBaseUrl() };
}

export function serverLogsSpacesPrefix(): string {
  const base = process.env.DO_SPACES_SERVER_LOG_PREFIX?.trim() || "server-logs";
  const inst =
    process.env.SERVER_LOG_INSTANCE_ID?.trim() ||
    process.env.HOSTNAME?.trim() ||
    "default";
  return `${base.replace(/\/$/, "")}/${inst.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export async function listServerLogArchives(input: {
  continuationToken?: string;
  maxKeys?: number;
}): Promise<{
  keys: { key: string; lastModified?: string; size?: number }[];
  nextContinuationToken?: string;
}> {
  const t = trySpacesS3Client();
  if (!t) return { keys: [] };
  const prefix = `${serverLogsSpacesPrefix()}/`;
  const out = await t.client.send(
    new ListObjectsV2Command({
      Bucket: t.bucket,
      Prefix: prefix,
      ContinuationToken: input.continuationToken,
      MaxKeys: Math.min(500, Math.max(1, input.maxKeys ?? 100)),
    }),
  );
  const keys =
    out.Contents?.map((c) => ({
      key: c.Key ?? "",
      lastModified: c.LastModified?.toISOString(),
      size: c.Size,
    })).filter((k) => k.key && k.key.endsWith(".ndjson.gz")) ?? [];
  return {
    keys,
    nextContinuationToken: out.IsTruncated ? out.NextContinuationToken : undefined,
  };
}

export { ALLOWED_TYPES };
export const MAX_AVATAR_BYTES = MAX_PROFILE_AVATAR_BYTES;

export function extensionForContentType(contentType: string): string | null {
  const ct = contentType.trim().toLowerCase();
  return ALLOWED_TYPES[ct] ?? null;
}

export async function presignAvatarPut(input: {
  contentType: string;
  objectKey: string;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const { client, bucket, publicBase } = requireSpacesEnv();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.objectKey,
    ContentType: input.contentType,
    // Without this, objects are private: PUT succeeds but GET (browser / next/image) returns 403.
    ACL: "public-read",
  });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  const publicUrl = `${publicBase}/${input.objectKey}`;
  return { uploadUrl, publicUrl };
}

/** True if url is HTTPS and under our public base + avatars/{userId}/ prefix. */
export function isAvatarUrlAllowedForUser(
  publicUrl: string,
  userId: string,
): boolean {
  let u: URL;
  try {
    u = new URL(publicUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const base = trySpacesPublicBaseUrl();
  if (!base) return false;
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return false;
  }
  if (u.origin !== baseUrl.origin) return false;
  const prefix = `/avatars/${userId}/`;
  if (!u.pathname.startsWith(prefix)) return false;
  return true;
}
