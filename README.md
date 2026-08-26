# TalentAI — Landing Page & Authentication

Landing page and Supabase-backed authentication for an AI candidate sourcing
platform. This slice covers only: landing page, login/register, Google OAuth,
session persistence, protected `/dashboard`. No search/JD parsing/AI yet.

## Setup

1. Install dependencies: `npm install`
2. `.env.local` is already populated with this project's Supabase URL and
   publishable key.
3. In the Supabase SQL Editor, run [supabase/schema.sql](supabase/schema.sql)
   once. It creates the `profiles` table (RLS enabled, users can only read/update
   their own row) and a trigger that inserts a profile automatically whenever a
   new `auth.users` row is created (covers both email/password sign-up and
   Google sign-in).
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
- `src/app/dashboard` — protected page, reads the user's profile
- `src/lib/supabase/{client,server,middleware}.ts` — Supabase client factories
- `src/proxy.ts` — refreshes the Supabase session on every request and
  redirects unauthenticated users away from `/dashboard`, and authenticated
  users away from `/login` and `/register`
- `supabase/schema.sql` — `profiles` table, RLS policies, auto-create trigger
