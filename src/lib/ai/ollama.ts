import {
  jobRequirementsSchema,
  type JobRequirementsExtraction,
} from "@/lib/jobs/analysis-schema";
import {
  searchQueriesResponseSchema,
  type GeneratedSearchQuery,
} from "@/lib/jobs/queries-schema";
import {
  candidateEvaluationSchema,
  type CandidateEvaluation,
} from "@/lib/jobs/ranking-schema";
import {
  extractedSearchCandidatesResponseSchema,
  type ExtractedSearchCandidate,
} from "@/lib/jobs/candidates-schema";
import type { WebSearchResult } from "@/lib/search/searxng";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5";

// Local models can take a while on modest hardware; give it a generous ceiling
// so we time out with a clear message instead of hanging the request forever.
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

export class OllamaConnectionError extends Error {}
export class OllamaResponseError extends Error {}

async function chatJson(systemPrompt: string, userContent: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OllamaConnectionError(
        "The AI model took too long to respond. Please try again.",
      );
    }
    throw new OllamaConnectionError(
      "Could not reach the local AI model. Make sure Ollama is running and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new OllamaConnectionError(
      `The AI model returned an error (status ${response.status}). Make sure Ollama is running and that the "${OLLAMA_MODEL}" model is installed (run "ollama pull ${OLLAMA_MODEL}").`,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const content =
    payload && typeof payload === "object" && "message" in payload
      ? (payload as { message?: { content?: unknown } }).message?.content
      : undefined;

  if (typeof content !== "string" || !content.trim()) {
    throw new OllamaResponseError(
      "The AI model returned an empty response. Please try again.",
    );
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new OllamaResponseError(
      "The AI model returned a response that could not be understood. Please try again.",
    );
  }
}

const ANALYSIS_SYSTEM_PROMPT = `You are a precise recruiting analyst. You will be given the full text of a single job description.

Rules:
- Use only facts stated in the job description. Never invent, assume, or infer experience, skills, or requirements that are not present in the text.
- Separate requirements that are explicitly mandatory ("must have", "required", "must possess") from those that are optional ("preferred", "nice to have", "a plus", "bonus").
- "required_skills" is the flat list of concrete skills, tools, certifications, or technologies mentioned anywhere in the JD (mandatory or preferred combined).
- "related_titles" are plausible alternative job titles a recruiter could use to search for this same role, based only on the seniority and function actually described in the JD.
- "target_companies" are specific companies or types of companies named in the JD as a sourcing target (e.g. "candidates from FMCG companies"). Leave empty if none are named.
- "exclusions" are anything the JD explicitly says to avoid or rule out (e.g. "no agency candidates", "not open to relocation").
- If a single-value field is not stated in the job description, respond with exactly "Not Specified" for that field.
- If a list field has no matching items in the job description, respond with an empty array for that field.
- Respond with ONLY a single JSON object, no markdown formatting and no commentary, matching exactly this shape:
{
  "job_title": string,
  "location": string,
  "seniority": string,
  "industry": string,
  "minimum_experience": string,
  "must_have": string[],
  "preferred": string[],
  "required_skills": string[],
  "related_titles": string[],
  "target_companies": string[],
  "exclusions": string[]
}`;

export async function analyzeJobDescription(
  jdText: string,
): Promise<JobRequirementsExtraction> {
  const parsedJson = await chatJson(
    ANALYSIS_SYSTEM_PROMPT,
    `Job description:\n"""\n${jdText}\n"""`,
  );

  const result = jobRequirementsSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      "The AI model returned an unexpected response. Please try again.",
    );
  }

  return result.data;
}

const SEARCH_QUERY_SYSTEM_PROMPT = `You are a precise sourcing strategist. You will be given structured hiring requirements already extracted from a job description.

Rules:
- Use only the requirements provided below. Never invent companies, titles, skills, or locations that are not present in the input.
- A "Target Companies" or "Previous Companies" query may only name companies that literally appear in the input's target_companies list. If target_companies is empty, do not produce a Target Companies or Previous Companies query at all.
- Never invent a company or generic domain placeholder (e.g. "site:company.com") — every site: filter must target a real, generic public site (linkedin.com/in, indeed.com, etc.), never a made-up company domain.
- List the BROADEST, most likely to return results queries first: start with just the job title plus location, then the job title alone, before adding any skills, seniority, or site: filters. A query cramming together every must-have skill, the exact title, seniority, AND location AND a site: filter all at once is too narrow — split it into several looser queries instead. Do not require all JD skills in one query.
- Prioritize must-have requirements and required_skills over preferred ones, but keep each individual query to at most one or two of them combined with the title/location — never all of them at once.
- Use related_titles for "Related Job Titles" queries where they are useful alternatives to the exact job title.
- Prefer compact, boolean-style search syntax: quotes for exact phrases, OR to combine alternatives, and site: to scope a domain to a real public site. Keep every query short enough to paste directly into a search engine.
- Cover a mix of these query types where the input supports them, using these exact labels for "query_type": "Exact Job Title", "Related Job Titles", "Must-Have Skills", "Industry", "Location", "Target Companies", "Previous Companies", "Seniority", "LinkedIn Discovery", "Public PDFs & Bios".
- "LinkedIn Discovery" queries should start with site:linkedin.com/in.
- "Public PDFs & Bios" queries should target public executive bios or resumes, e.g. using filetype:pdf.
- Produce between 5 and 15 queries in total, with no duplicate query_text values, ordered from broadest to most specific.
- Respond with ONLY a single JSON object, no markdown formatting and no commentary, matching exactly this shape:
{
  "queries": [
    { "query_text": string, "query_type": string }
  ]
}`;

export async function generateSearchQueries(
  requirements: JobRequirementsExtraction,
): Promise<GeneratedSearchQuery[]> {
  const parsedJson = await chatJson(
    SEARCH_QUERY_SYSTEM_PROMPT,
    `Job requirements:\n"""\n${JSON.stringify(requirements, null, 2)}\n"""`,
  );

  const result = searchQueriesResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      "The AI model returned an unexpected response. Please try again.",
    );
  }

  const seen = new Set<string>();
  const deduped: GeneratedSearchQuery[] = [];
  for (const query of result.data.queries) {
    const key = query.query_text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(query);
    if (deduped.length === 15) break;
  }

  if (deduped.length === 0) {
    throw new OllamaResponseError(
      "The AI model did not return any usable search queries. Please try again.",
    );
  }

  return deduped;
}

const RANKING_SYSTEM_PROMPT = `You are a precise recruiting analyst comparing one candidate's publicly available profile information against a single job's hiring requirements.

Rules:
- Use only the candidate information provided below (current title, current company, location, and profile snippet). Never invent, assume, or guess any experience, skill, employer, certification, industry, or fact that is not explicitly present in that text.
- For every item in "must_have", "preferred", and "required_skills", decide a status:
  - "Match" if the candidate information explicitly confirms the requirement.
  - "Partial" if the candidate information suggests a related or partial match but does not fully confirm it.
  - "Not Confirmed" if the candidate information does not mention or address the requirement at all.
- Compare the candidate's title, company, location, and snippet against the job's "industry", "seniority", "location", and "minimum_experience" using the same three statuses.
- "evidence" must be a short quote or close paraphrase of the specific part of the candidate information that supports the status. If the status is "Not Confirmed", respond with exactly "No mention found in the available candidate information."
- Repeat each "requirement" value exactly as given in the input so it can be matched back to its source.
- Do not compute or output any numeric score. Only return the statuses and evidence described above.
- Respond with ONLY a single JSON object, no markdown formatting and no commentary, matching exactly this shape:
{
  "must_have": [{ "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string }],
  "preferred": [{ "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string }],
  "skills": [{ "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string }],
  "industry": { "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string },
  "seniority": { "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string },
  "location": { "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string },
  "experience": { "requirement": string, "status": "Match"|"Partial"|"Not Confirmed", "evidence": string }
}`;

export interface CandidateEvaluationInput {
  full_name: string;
  current_title: string;
  current_company: string;
  location: string;
  snippet: string | null;
}

export async function evaluateCandidateAgainstRequirements(
  requirements: JobRequirementsExtraction,
  candidate: CandidateEvaluationInput,
): Promise<CandidateEvaluation> {
  const userContent = `Job requirements:\n${JSON.stringify(
    {
      must_have: requirements.must_have,
      preferred: requirements.preferred,
      required_skills: requirements.required_skills,
      industry: requirements.industry,
      seniority: requirements.seniority,
      location: requirements.location,
      minimum_experience: requirements.minimum_experience,
    },
    null,
    2,
  )}\n\nCandidate information:\n${JSON.stringify(
    {
      current_title: candidate.current_title,
      current_company: candidate.current_company,
      location: candidate.location,
      snippet: candidate.snippet ?? "Not Found",
    },
    null,
    2,
  )}`;

  const parsedJson = await chatJson(RANKING_SYSTEM_PROMPT, userContent);

  const result = candidateEvaluationSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      `The AI model returned an unexpected response while evaluating ${candidate.full_name}.`,
    );
  }

  return result.data;
}

const CANDIDATE_EXTRACTION_SYSTEM_PROMPT = `You are a precise sourcing analyst. You will be given a job's hiring requirements and a batch of public web search results (title, link, snippet).

Rules:
- Only extract a result if it clearly identifies ONE specific, named, real individual person who could plausibly be a candidate for this role (e.g. a LinkedIn profile, a personal bio page, an executive profile, a public resume/CV).
- Never invent a person. Skip results that are job listing pages, company pages, news articles, aggregator/directory listing pages, ads, or anything that does not name a specific individual.
- If the same person appears in more than one result, only return them once.
- "profile_url" must be copied EXACTLY, character-for-character, from that result's "link" field. Never modify, shorten, or invent a URL.
- "full_name" must be the person's actual name as it appears in the result. Never use a job title, company name, or generic phrase as the name.
- "current_title" and "current_company" should be extracted from the title/snippet if stated; otherwise respond with exactly "Not Found".
- "location" should be extracted only if explicitly stated in the title/snippet; otherwise respond with exactly "Not Found".
- "source" should briefly describe where this was found (e.g. "LinkedIn Profile", "Company Bio Page", "Public Resume").
- If no result in the batch represents an identifiable individual, return an empty array.
- Respond with ONLY a single JSON object, no markdown formatting and no commentary, matching exactly this shape:
{
  "candidates": [
    { "full_name": string, "current_title": string, "current_company": string, "location": string, "profile_url": string, "source": string }
  ]
}`;

export async function extractCandidatesFromSearchResults(
  requirements: JobRequirementsExtraction,
  results: WebSearchResult[],
): Promise<ExtractedSearchCandidate[]> {
  if (results.length === 0) return [];

  const userContent = `Job requirements:\n${JSON.stringify(
    {
      job_title: requirements.job_title,
      related_titles: requirements.related_titles,
      industry: requirements.industry,
      seniority: requirements.seniority,
    },
    null,
    2,
  )}\n\nSearch results:\n${JSON.stringify(results, null, 2)}`;

  const parsedJson = await chatJson(CANDIDATE_EXTRACTION_SYSTEM_PROMPT, userContent);

  const result = extractedSearchCandidatesResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      "The AI model returned an unexpected response while extracting candidates from search results.",
    );
  }

  const validLinks = new Set(results.map((r) => r.link));

  return result.data.candidates.filter(
    (candidate) => candidate.full_name.length > 0 && validLinks.has(candidate.profile_url),
  );
}
