# TalentAI — AI Candidate Sourcing

Landing page, Supabase-backed authentication, and the start of a candidate
search flow. This slice covers: landing page, login/register, Google OAuth,
session persistence, protected `/dashboard`, and creating + listing job
searches (`/search/new`, `/search/[id]`). No JD parsing/AI analysis or
candidate search yet — a saved search just sits as a `draft`.

## Setup

1. Install dependencies: `npm install`
2. `.env.local` is already populated with this project's Supabase URL and
   publishable key.
3. In the Supabase SQL Editor, run [supabase/schema.sql](supabase/schema.sql)
   once (safe to re-run). It creates:
   - `profiles` — RLS enabled, users can only read/update their own row, plus
     a trigger that inserts a profile whenever a new `auth.users` row is
     created (covers both email/password sign-up and Google sign-in).
   - `jobs` — one row per saved candidate search (RLS enabled, users can only
     see/edit/delete their own rows).
   - a private `job-descriptions` Storage bucket for uploaded JD files, with
     Storage RLS policies scoping every file to the `<user_id>/...` folder of
     its uploader.
4. To enable **Google OAuth**: in the Supabase dashboard under
   Authentication → Sign In / Providers → Google, add your Google OAuth
   Client ID/Secret. Under Authentication → URL Configuration, add
   `http://localhost:3000/auth/callback` (and your production URL's
   equivalent) to **Redirect URLs**.
5. Run the dev server: `npm run dev`, then open http://localhost:3000.

## Structure

- `src/app/page.tsx` — landing page
- `src/app/login`, `src/app/register` — auth pages
- `src/app/auth/callback` — OAuth code-exchange route
- `src/app/dashboard` — protected page: profile welcome + Recent Searches
- `src/app/search/new` — job description intake (upload or paste) + job
  details, saves a `jobs` row
- `src/app/search/[id]` — read-only view of a saved search (the "Continue"
  destination from the dashboard; analysis isn't built yet)
- `src/lib/supabase/{client,server,middleware}.ts` — Supabase client factories
- `src/lib/jobs/{actions,types,validation}.ts` — server actions
  (`createJob`, `deleteJob`) and shared validation for JD uploads
- `src/proxy.ts` — refreshes the Supabase session on every request and
  redirects unauthenticated users away from `/dashboard` and `/search`, and
  authenticated users away from `/login` and `/register`
- `supabase/schema.sql` — `profiles` + `jobs` tables, RLS policies, Storage
  bucket + policies, auto-create trigger
