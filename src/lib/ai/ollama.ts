import {
  jobRequirementsSchema,
  type JobRequirementsExtraction,
} from "@/lib/jobs/analysis-schema";
import {
  searchQueriesResponseSchema,
  type GeneratedSearchQuery,
} from "@/lib/jobs/queries-schema";
import {
  candidateExtractionResponseSchema,
  type ExtractedCandidateInfo,
} from "@/lib/jobs/candidates-schema";

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
- Prioritize must-have requirements and required_skills over preferred ones.
- Use related_titles for "Related Job Titles" queries where they are useful alternatives to the exact job title.
- Prefer compact, boolean-style Google search syntax: quotes for exact phrases, OR to combine alternatives, and site: to scope a domain. Keep every query short enough to paste directly into Google.
- Cover a mix of these query types where the input supports them, using these exact labels for "query_type": "Exact Job Title", "Related Job Titles", "Must-Have Skills", "Industry", "Location", "Target Companies", "Previous Companies", "Seniority", "LinkedIn Discovery", "Company Website", "Public PDFs & Bios".
- "LinkedIn Discovery" queries should start with site:linkedin.com/in.
- "Company Website" queries should start with site:company.com as a literal placeholder domain, since no real target company websites are known.
- "Public PDFs & Bios" queries should target public executive bios or resumes, e.g. using filetype:pdf.
- Produce between 5 and 15 queries in total, with no duplicate query_text values.
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

const CANDIDATE_EXTRACTION_SYSTEM_PROMPT = `You are a precise research assistant helping a recruiter identify real, named individuals from public web search results.

You will be given a JSON array of search results, each with an "index", "title", "link", and "snippet".

Rules:
- Use only facts stated in the title, link, and snippet for each result. Never invent, assume, or guess a person's name, title, company, or location.
- Set "is_person" to true only if the result clearly refers to one specific, named individual (e.g. a LinkedIn profile, a personal bio, a named speaker or executive). Set it to false for company pages, job listings, aggregate lists, search hubs, or anything that does not name a specific individual.
- "full_name" must be the person's full name exactly as it appears in the title or snippet. If is_person is false, respond with "Not Found".
- "current_title" is their current job title if stated, otherwise exactly "Not Found".
- "current_company" is their current employer if stated, otherwise exactly "Not Found".
- "location" is their current city, country, or region if stated, otherwise exactly "Not Found".
- Every input index must appear exactly once in the output, in any order.
- Respond with ONLY a single JSON object, no markdown formatting and no commentary, matching exactly this shape:
{
  "candidates": [
    { "index": number, "is_person": boolean, "full_name": string, "current_title": string, "current_company": string, "location": string }
  ]
}`;

export interface CandidateExtractionInput {
  index: number;
  title: string;
  link: string;
  snippet: string;
}

export async function extractCandidatesFromResults(
  results: CandidateExtractionInput[],
): Promise<ExtractedCandidateInfo[]> {
  if (results.length === 0) return [];

  const parsedJson = await chatJson(
    CANDIDATE_EXTRACTION_SYSTEM_PROMPT,
    `Search results:\n${JSON.stringify(results, null, 2)}`,
  );

  const result = candidateExtractionResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      "The AI model returned an unexpected response while extracting candidates.",
    );
  }

  return result.data.candidates;
}
