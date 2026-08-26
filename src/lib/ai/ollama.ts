import {
  jobRequirementsSchema,
  type JobRequirementsExtraction,
} from "@/lib/jobs/analysis-schema";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5";

// Local models can take a while on modest hardware; give it a generous ceiling
// so we time out with a clear message instead of hanging the request forever.
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

export class OllamaConnectionError extends Error {}
export class OllamaResponseError extends Error {}

const SYSTEM_PROMPT = `You are a precise recruiting analyst. You will be given the full text of a single job description.

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
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Job description:\n"""\n${jdText}\n"""`,
          },
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

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new OllamaResponseError(
      "The AI model returned a response that could not be understood. Please try again.",
    );
  }

  const result = jobRequirementsSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new OllamaResponseError(
      "The AI model returned an unexpected response. Please try again.",
    );
  }

  return result.data;
}
