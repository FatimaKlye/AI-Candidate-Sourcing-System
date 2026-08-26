// Best-effort, zero-cost candidate profile extraction: fetches a
// recruiter-supplied public URL and reads its HTML <title>/meta tags —
// the same information a link-preview card (Slack, Twitter, iMessage)
// would read. No API key, no paid service, no LinkedIn-specific scraping.
// If the page blocks unauthenticated requests or the tags don't parse into
// a name, extraction fails and the recruiter fills the fields in by hand.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ExtractedProfileInfo } from "@/lib/jobs/candidates-schema";

export class ProfileFetchError extends Error {}

const REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_BYTES = 2_000_000;

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

async function assertPublicHostname(hostname: string): Promise<void> {
  if (hostname === "localhost") {
    throw new ProfileFetchError("That URL points to a private network address.");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new ProfileFetchError("That URL points to a private network address.");
    }
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new ProfileFetchError("Could not resolve that URL.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new ProfileFetchError("That URL points to a private network address.");
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, attr: "property" | "name", key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }
  return null;
}

function classifyHost(hostname: string): string {
  const host = hostname.replace(/^www\./, "");
  if (host.includes("linkedin.com")) return "LinkedIn Profile";
  if (host.includes("github.com")) return "GitHub";
  if (host.includes("twitter.com") || host.includes("x.com")) return "X (Twitter)";
  return "Public Web Page";
}

function parseProfileHtml(html: string, hostname: string): ExtractedProfileInfo {
  const ogTitle = extractMeta(html, "property", "og:title");
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const rawTitle = decodeHtmlEntities((ogTitle || titleTag || "").trim());

  const ogDescription =
    extractMeta(html, "property", "og:description") ?? extractMeta(html, "name", "description") ?? "";

  const segments = rawTitle
    .split(/\s*[-|–]\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const full_name = segments[0] || "Not Found";

  let current_title = "Not Found";
  let current_company = "Not Found";

  const atMatch = (segments[1] ?? ogDescription).match(/(.+?)\s+at\s+(.+)/i);
  if (atMatch) {
    current_title = atMatch[1].trim();
    current_company = atMatch[2].trim().split(/[.|]/)[0].trim();
  } else if (segments[1]) {
    current_title = segments[1];
    if (segments[2]) current_company = segments[2];
  }

  return {
    full_name,
    current_title,
    current_company,
    location: "Not Found",
    source: classifyHost(hostname),
  };
}

/**
 * Fetches a publicly accessible URL and reads name/title/company hints from
 * its HTML title and Open Graph tags. Throws ProfileFetchError for anything
 * that should send the recruiter to manual entry instead (unreachable,
 * blocked, non-HTML, or a page whose tags don't yield a name).
 */
export async function extractProfileInfo(rawUrl: string): Promise<ExtractedProfileInfo> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ProfileFetchError("Enter a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProfileFetchError("Profile URL must start with http:// or https://");
  }

  await assertPublicHostname(parsed.hostname);

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TalentAI-Import/1.0; +candidate profile import)",
      },
    });
  } catch {
    throw new ProfileFetchError("Could not reach that page. It may not be publicly accessible.");
  }

  if (!response.ok) {
    throw new ProfileFetchError(`That page returned an error (status ${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new ProfileFetchError("That page is not a readable public profile page.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BYTES) {
    throw new ProfileFetchError("That page is too large to read.");
  }

  const html = (await response.text()).slice(0, MAX_BYTES);
  const info = parseProfileHtml(html, parsed.hostname);

  if (info.full_name === "Not Found") {
    throw new ProfileFetchError(
      "Could not automatically extract candidate details from this page. Please enter them manually.",
    );
  }

  return info;
}
