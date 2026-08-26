// Thin wrapper around a locally running SearXNG instance's JSON search API
// (https://docs.searxng.org/dev/search_api.html). SearXNG aggregates results
// from many public search engines, so this is the only public-web source
// wired up for now; other sources (JobStreet, LinkedIn, etc.) can add
// sibling files here that return the same WebSearchResult[] shape so the
// candidate pipeline doesn't need to change.

export class SearxngRequestError extends Error {}

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  engine: string;
}

const UNAVAILABLE_MESSAGE =
  "Local search service is unavailable. Make sure SearXNG is running and try again.";

const REQUEST_TIMEOUT_MS = 10 * 1000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

interface SearxngApiResultItem {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  engines?: string[];
}

// SearXNG reports per-engine failures (rate limits, CAPTCHAs, timeouts) here
// even on an overall 200 response with `results: []`. Surfacing this in dev
// logs is what tells "genuinely no matches for this role" apart from "every
// engine is currently failing" — the two look identical from `results.length`
// alone but call for very different fixes.
type SearxngEngineError = [engine: string, reason: string];

interface SearxngApiResponse {
  results?: SearxngApiResultItem[];
  unresponsive_engines?: SearxngEngineError[];
}

const isDev = process.env.NODE_ENV !== "production";

function getBaseUrl(): string {
  const base = process.env.SEARXNG_URL || "http://localhost:8888";
  return base.replace(/\/$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url: string, query: string): Promise<SearxngApiResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if (isDev) {
      console.log(
        `[searxng] query=${JSON.stringify(query)} url=${url} FAILED (network error): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    throw new SearxngRequestError(UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) {
    if (isDev) {
      console.log(
        `[searxng] query=${JSON.stringify(query)} url=${url} status=${response.status} (non-2xx)`,
      );
    }
    throw new SearxngRequestError(UNAVAILABLE_MESSAGE);
  }

  const payload = (await response.json().catch(() => null)) as SearxngApiResponse | null;
  if (!payload) {
    if (isDev) {
      console.log(
        `[searxng] query=${JSON.stringify(query)} url=${url} status=${response.status} (unparseable JSON body)`,
      );
    }
    throw new SearxngRequestError(UNAVAILABLE_MESSAGE);
  }

  if (isDev) {
    const results = payload.results ?? [];
    console.log(
      [
        `[searxng] query=${JSON.stringify(query)}`,
        `url=${url}`,
        `status=${response.status}`,
        `results=${results.length}`,
        `engineErrors=${JSON.stringify(payload.unresponsive_engines ?? [])}`,
      ].join(" "),
    );
    console.log(
      "[searxng] first 3 results:",
      JSON.stringify(
        results.slice(0, 3).map((r) => ({ title: r.title, url: r.url, engine: r.engine })),
        null,
        2,
      ),
    );
  }

  return payload;
}

/**
 * Queries the local SearXNG instance's JSON search API. Retries once on any
 * failure (unreachable, non-2xx, unparseable body) before surfacing the
 * "Local search service is unavailable" error — never hangs indefinitely
 * thanks to the per-attempt timeout.
 */
export async function searchWeb(
  query: string,
  resultCount = 8,
): Promise<WebSearchResult[]> {
  const url = new URL(`${getBaseUrl()}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const payload = await fetchOnce(url.toString(), query);
      const items = payload.results ?? [];

      return items
        .filter(
          (item): item is SearxngApiResultItem & { title: string; url: string } =>
            typeof item.title === "string" &&
            item.title.trim().length > 0 &&
            typeof item.url === "string" &&
            item.url.trim().length > 0,
        )
        .slice(0, resultCount)
        .map((item) => ({
          title: item.title,
          link: item.url,
          snippet: item.content ?? "",
          engine: item.engine ?? item.engines?.[0] ?? "searxng",
        }));
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError instanceof SearxngRequestError
    ? lastError
    : new SearxngRequestError(UNAVAILABLE_MESSAGE);
}
