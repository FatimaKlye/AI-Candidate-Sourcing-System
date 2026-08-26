// Public-web contact discovery for a single candidate. Reuses the same
// Google Custom Search source as candidate-pipeline.ts — no paid
// people-data API is used. Every result is either a fact lifted straight
// from a public search snippet ("Publicly Found") or a locally generated
// email-pattern guess that is always labelled "Possible" / unverified, per
// AGENTS.md: never present a guessed email or invented phone number as
// confirmed.

import { searchWeb, GoogleSearchConfigError, type WebSearchResult } from "./google";
import type { ContactStatus } from "@/lib/jobs/contacts-schema";

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(\+?\d[\d ().-]{7,}\d)/;

const SOCIAL_OR_AGGREGATOR_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "wikipedia.org",
  "glassdoor.com",
  "indeed.com",
  "crunchbase.com",
  "bloomberg.com",
  "youtube.com",
  "zoominfo.com",
];

export interface ContactSearchInput {
  fullName: string;
  currentTitle: string;
  currentCompany: string;
}

export interface ContactSearchResult {
  email: string | null;
  emailStatus: ContactStatus;
  phone: string | null;
  phoneStatus: ContactStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: number;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts[parts.length - 1] : "",
  };
}

function normalizeNamePart(part: string): string {
  return part.toLowerCase().replace(/[^a-z]/g, "");
}

function isLikelyCompanyDomain(hostname: string): boolean {
  return !SOCIAL_OR_AGGREGATOR_HOSTS.some((host) => hostname.includes(host));
}

async function findCompanyDomain(company: string): Promise<string | null> {
  const results = await searchWeb(`${company} official website contact`, 5);
  for (const result of results) {
    let hostname: string;
    try {
      hostname = new URL(result.link).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (isLikelyCompanyDomain(hostname)) return hostname;
  }
  return null;
}

function extractFromResults(
  results: WebSearchResult[],
): Pick<ContactSearchResult, "email" | "phone" | "sourceName" | "sourceUrl"> | null {
  for (const result of results) {
    const haystack = `${result.title} ${result.snippet}`;
    const emailMatch = haystack.match(EMAIL_REGEX);
    const phoneMatch = haystack.match(PHONE_REGEX);

    if (emailMatch || phoneMatch) {
      return {
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0].trim() : null,
        sourceName: result.title,
        sourceUrl: result.link,
      };
    }
  }
  return null;
}

/**
 * Searches free public web sources for a candidate's work contact details.
 * Falls back to a single locally generated email-pattern guess (never
 * marked as verified) when nothing publicly published is found. A missing
 * search API key aborts immediately since every subsequent call would fail
 * identically; any other per-query failure is treated as "nothing found"
 * so one bad request doesn't fail the whole lookup.
 */
export async function findPublicContact(
  input: ContactSearchInput,
): Promise<ContactSearchResult> {
  const { fullName, currentCompany } = input;

  const directQueries = [
    `"${fullName}" "${currentCompany}" email`,
    `"${fullName}" "${currentCompany}" contact`,
  ];

  for (const query of directQueries) {
    let results: WebSearchResult[];
    try {
      results = await searchWeb(query, 8);
    } catch (err) {
      if (err instanceof GoogleSearchConfigError) throw err;
      continue;
    }

    const found = extractFromResults(results);
    if (found) {
      return {
        email: found.email,
        emailStatus: found.email ? "Publicly Found" : "Not Found",
        phone: found.phone,
        phoneStatus: found.phone ? "Publicly Found" : "Not Found",
        sourceName: found.sourceName,
        sourceUrl: found.sourceUrl,
        confidence: found.email ? 90 : 70,
      };
    }
  }

  // Nothing published was found directly — try a locally generated email
  // pattern against the company's own domain. Always "Possible", never
  // "Publicly Found", and no phone number is ever invented.
  let domain: string | null = null;
  try {
    domain = await findCompanyDomain(currentCompany);
  } catch (err) {
    if (err instanceof GoogleSearchConfigError) throw err;
  }

  if (domain) {
    const { first, last } = splitName(fullName);
    const f = normalizeNamePart(first);
    const l = normalizeNamePart(last);
    if (f) {
      const guess = l ? `${f}.${l}@${domain}` : `${f}@${domain}`;
      return {
        email: guess,
        emailStatus: "Possible",
        phone: null,
        phoneStatus: "Not Found",
        sourceName: `${currentCompany} company domain (pattern guess)`,
        sourceUrl: `https://${domain}`,
        confidence: 30,
      };
    }
  }

  return {
    email: null,
    emailStatus: "Not Found",
    phone: null,
    phoneStatus: "Not Found",
    sourceName: null,
    sourceUrl: null,
    confidence: 0,
  };
}
