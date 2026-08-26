import { searchWeb, GoogleSearchConfigError } from "./google";
import { extractCandidatesFromResults } from "@/lib/ai/ollama";
import type { DiscoveredCandidate } from "./types";

const RESULTS_PER_QUERY = 8;

function classifySource(link: string): string {
  let hostname: string;
  try {
    hostname = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Public Web Page";
  }

  if (hostname.includes("linkedin.com")) {
    return link.includes("/in/") ? "LinkedIn Profile" : "LinkedIn";
  }
  if (link.toLowerCase().endsWith(".pdf")) return "Public PDF";
  if (/(news|reuters|bloomberg|forbes|techcrunch|businesswire|prnewswire)/i.test(hostname)) {
    return "News Article";
  }
  return "Public Web Page";
}

export interface RunSearchPipelineResult {
  candidates: DiscoveredCandidate[];
  searchesCompleted: number;
  possibleCandidatesFound: number;
}

/**
 * Runs each saved search query against the configured public-web source,
 * extracts named individuals from the results, and returns them
 * un-deduplicated. A failure on one query (bad results, extraction error)
 * is skipped rather than aborting the whole run; a missing configuration
 * (no search API key) aborts immediately since every query would fail.
 */
export async function runSearchPipeline(
  queries: string[],
): Promise<RunSearchPipelineResult> {
  const discovered: DiscoveredCandidate[] = [];
  let searchesCompleted = 0;
  let possibleCandidatesFound = 0;

  for (const queryText of queries) {
    let results;
    try {
      results = await searchWeb(queryText, RESULTS_PER_QUERY);
    } catch (err) {
      if (err instanceof GoogleSearchConfigError) throw err;
      searchesCompleted += 1;
      continue;
    }

    possibleCandidatesFound += results.length;

    if (results.length > 0) {
      try {
        const extracted = await extractCandidatesFromResults(
          results.map((r, index) => ({
            index,
            title: r.title,
            link: r.link,
            snippet: r.snippet,
          })),
        );

        for (const item of extracted) {
          if (!item.is_person) continue;
          const source = results[item.index];
          if (!source) continue;

          discovered.push({
            full_name: item.full_name,
            current_title: item.current_title,
            current_company: item.current_company,
            location: item.location,
            profile_url: source.link,
            source: `Google → ${classifySource(source.link)}`,
            source_url: source.link,
            snippet: source.snippet || "Not Found",
          });
        }
      } catch {
        // Extraction failing for one query's batch of results shouldn't
        // abort the rest of the run.
      }
    }

    searchesCompleted += 1;
  }

  return { candidates: discovered, searchesCompleted, possibleCandidatesFound };
}
