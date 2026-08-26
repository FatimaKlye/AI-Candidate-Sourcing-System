// Thin wrapper around the Google Custom Search JSON API. This is the only
// public-web source wired up for now; other sources (JobStreet, LinkedIn,
// etc.) can add sibling files here that return the same WebSearchResult[]
// shape so the candidate pipeline doesn't need to change.

export class GoogleSearchConfigError extends Error {}
export class GoogleSearchRequestError extends Error {}

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

const REQUEST_TIMEOUT_MS = 15 * 1000;

interface GoogleSearchApiItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface GoogleSearchApiResponse {
  items?: GoogleSearchApiItem[];
}

export async function searchWeb(
  query: string,
  resultCount = 8,
): Promise<WebSearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    throw new GoogleSearchConfigError(
      "Public web search is not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID.",
    );
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(Math.min(Math.max(resultCount, 1), 10)));

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GoogleSearchRequestError(
      "Could not reach Google Search. Please try again.",
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new GoogleSearchRequestError(
        "Google Search rate limit reached. Please try again later.",
      );
    }
    throw new GoogleSearchRequestError(
      `Google Search returned an error (status ${response.status}).`,
    );
  }

  const payload = (await response
    .json()
    .catch(() => null)) as GoogleSearchApiResponse | null;

  const items = payload?.items ?? [];

  return items
    .filter(
      (item): item is Required<GoogleSearchApiItem> =>
        typeof item.title === "string" && typeof item.link === "string",
    )
    .map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet ?? "",
    }));
}
