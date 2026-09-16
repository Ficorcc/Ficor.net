import { getRuntimeEnv } from "./runtime";
import { emailHash, sha256 } from "./crypto";

export { emailHash };

export async function ipHash(request: Request) {
  const env = getRuntimeEnv();
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "local";
  const salt = env.COMMENT_IP_SALT || env.COMMENT_SITE_NAME || "astro-comments";
  return sha256(`${salt}:${ip}`);
}

export function normalizeUrl(value?: string) {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getClientUserAgent(request: Request) {
  return (request.headers.get("user-agent") || "").slice(0, 300);
}
