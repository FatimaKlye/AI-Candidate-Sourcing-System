-- Run this once in the Supabase SQL Editor for this project.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user is created
-- (covers both email/password sign-up and Google OAuth sign-in).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Candidate search: jobs table + Storage for uploaded JD files.
-- Run this section once too (safe to re-run).
-- ============================================================

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_name text not null,
  company_name text,
  jd_text text,
  file_name text,
  file_path text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_user_id_created_at_idx
  on public.jobs (user_id, created_at desc);

alter table public.jobs enable row level security;

drop policy if exists "Users can view own jobs" on public.jobs;
create policy "Users can view own jobs"
  on public.jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own jobs" on public.jobs;
create policy "Users can insert own jobs"
  on public.jobs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own jobs" on public.jobs;
create policy "Users can update own jobs"
  on public.jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own jobs" on public.jobs;
create policy "Users can delete own jobs"
  on public.jobs for delete
  using (auth.uid() = user_id);

-- Keep updated_at current on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- Private storage bucket for uploaded JD files. Never made public; files are
-- only reachable via the owner's authenticated session or a signed URL.
insert into storage.buckets (id, name, public)
values ('job-descriptions', 'job-descriptions', false)
on conflict (id) do nothing;

-- Files are uploaded under a "<user_id>/..." path, so matching the first
-- path segment against auth.uid() scopes every operation to its owner.
drop policy if exists "Users can read own JD files" on storage.objects;
create policy "Users can read own JD files"
  on storage.objects for select
  using (
    bucket_id = 'job-descriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload own JD files" on storage.objects;
create policy "Users can upload own JD files"
  on storage.objects for insert
  with check (
    bucket_id = 'job-descriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own JD files" on storage.objects;
create policy "Users can delete own JD files"
  on storage.objects for delete
  using (
    bucket_id = 'job-descriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
