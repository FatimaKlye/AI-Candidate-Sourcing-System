// A candidate as discovered by a source (Google, and later others), before
// it's deduplicated and persisted. Keeping this shape separate from the
// Supabase `Candidate` row lets new discovery sources plug into the same
// pipeline without depending on the database layer.
export interface DiscoveredCandidate {
  full_name: string;
  current_title: string;
  current_company: string;
  location: string;
  profile_url: string | null;
  source: string;
  source_url: string | null;
  snippet: string;
}
