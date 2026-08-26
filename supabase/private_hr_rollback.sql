-- Reverses private_hr_upgrade.sql.
-- New private-HR records are copied to an isolated backup schema first.

begin;

create schema if not exists private_hr_rollback_20260826;
revoke all on schema private_hr_rollback_20260826 from public, anon, authenticated;

create table if not exists private_hr_rollback_20260826.workspaces as
  select * from public.workspaces;
create table if not exists private_hr_rollback_20260826.workspace_members as
  select * from public.workspace_members;
create table if not exists private_hr_rollback_20260826.candidate_notes as
  select * from public.candidate_notes;
create table if not exists private_hr_rollback_20260826.activity_logs as
  select * from public.activity_logs;
create table if not exists private_hr_rollback_20260826.candidate_source_connections as
  select * from public.candidate_source_connections;
create table if not exists private_hr_rollback_20260826.sourcing_runs as
  select * from public.sourcing_runs;
create table if not exists private_hr_rollback_20260826.hr_access_allowlist as
  select * from private.hr_access_allowlist;

drop trigger if exists on_private_hr_user_created on auth.users;
drop function if exists private.add_invited_user_to_default_workspace();

drop policy if exists "Workspace members can read resumes" on storage.objects;
drop policy if exists "Workspace members can upload resumes" on storage.objects;
drop policy if exists "Workspace members can update resumes" on storage.objects;
drop policy if exists "Workspace members can delete resumes" on storage.objects;
delete from storage.buckets where id = 'candidate-resumes';

drop policy if exists "Workspace members can read JD files" on storage.objects;
create policy "Users can read own JD files"
  on storage.objects for select
  using (
    bucket_id = 'job-descriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop table if exists public.sourcing_runs;
drop table if exists public.candidate_source_connections;
drop table if exists public.activity_logs;
drop table if exists public.candidate_notes;

drop policy if exists "Workspace members can view candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can create candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can update candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can delete candidate contacts" on public.candidate_contacts;
create policy "Users can view own candidate contacts" on public.candidate_contacts
  for select using (auth.uid() = user_id);
create policy "Users can insert own candidate contacts" on public.candidate_contacts
  for insert with check (auth.uid() = user_id);
create policy "Users can update own candidate contacts" on public.candidate_contacts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own candidate contacts" on public.candidate_contacts
  for delete using (auth.uid() = user_id);

drop policy if exists "Workspace members can view candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can create candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can update candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can delete candidate matches" on public.candidate_matches;
create policy "Users can view own candidate matches" on public.candidate_matches
  for select using (auth.uid() = user_id);
create policy "Users can insert own candidate matches" on public.candidate_matches
  for insert with check (auth.uid() = user_id);
create policy "Users can update own candidate matches" on public.candidate_matches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own candidate matches" on public.candidate_matches
  for delete using (auth.uid() = user_id);

drop policy if exists "Workspace members can view candidates" on public.candidates;
drop policy if exists "Workspace members can create candidates" on public.candidates;
drop policy if exists "Workspace members can update candidates" on public.candidates;
drop policy if exists "Workspace members can delete candidates" on public.candidates;
create policy "Users can view own candidates" on public.candidates
  for select using (auth.uid() = user_id);
create policy "Users can insert own candidates" on public.candidates
  for insert with check (auth.uid() = user_id);
create policy "Users can update own candidates" on public.candidates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own candidates" on public.candidates
  for delete using (auth.uid() = user_id);

drop policy if exists "Workspace members can view search queries" on public.search_queries;
drop policy if exists "Workspace members can create search queries" on public.search_queries;
drop policy if exists "Workspace members can update search queries" on public.search_queries;
drop policy if exists "Workspace members can delete search queries" on public.search_queries;
create policy "Users can view own search queries" on public.search_queries
  for select using (auth.uid() = user_id);
create policy "Users can insert own search queries" on public.search_queries
  for insert with check (auth.uid() = user_id);
create policy "Users can update own search queries" on public.search_queries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own search queries" on public.search_queries
  for delete using (auth.uid() = user_id);

drop policy if exists "Workspace members can view requirements" on public.job_requirements;
drop policy if exists "Workspace members can create requirements" on public.job_requirements;
drop policy if exists "Workspace members can update requirements" on public.job_requirements;
drop policy if exists "Workspace members can delete requirements" on public.job_requirements;
create policy "Users can view own job requirements" on public.job_requirements
  for select using (exists (
    select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
  ));
create policy "Users can insert own job requirements" on public.job_requirements
  for insert with check (exists (
    select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
  ));
create policy "Users can update own job requirements" on public.job_requirements
  for update using (exists (
    select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
  ));
create policy "Users can delete own job requirements" on public.job_requirements
  for delete using (exists (
    select 1 from public.jobs j where j.id = job_id and j.user_id = auth.uid()
  ));

drop policy if exists "Workspace members can view requisitions" on public.jobs;
drop policy if exists "Workspace members can create requisitions" on public.jobs;
drop policy if exists "Workspace members can update requisitions" on public.jobs;
drop policy if exists "Workspace members can delete requisitions" on public.jobs;
create policy "Users can view own jobs" on public.jobs for select
  using (auth.uid() = user_id);
create policy "Users can insert own jobs" on public.jobs for insert
  with check (auth.uid() = user_id);
create policy "Users can update own jobs" on public.jobs for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own jobs" on public.jobs for delete
  using (auth.uid() = user_id);

drop policy if exists "Workspace members can view profiles" on public.profiles;
create policy "Users can view own profile" on public.profiles for select
  using (auth.uid() = id);

alter table public.candidate_contacts
  drop column if exists contact_notes,
  drop column if exists contacted_at,
  drop column if exists contact_method,
  drop column if exists workspace_id;

drop index if exists public.candidate_matches_job_candidate_uidx;
alter table public.candidate_matches
  drop column if exists requirements_version,
  drop column if exists score_breakdown,
  drop column if exists last_activity_at,
  drop column if exists follow_up_at,
  drop column if exists review_status,
  drop column if exists explanation,
  drop column if exists matched_skills,
  drop column if exists workspace_id;

alter table public.candidates
  drop column if exists updated_at,
  drop column if exists status,
  drop column if exists availability,
  drop column if exists seniority,
  drop column if exists years_experience,
  drop column if exists skills,
  drop column if exists resume_path,
  drop column if exists workspace_id;

alter table public.job_requirements
  drop column if exists version,
  drop column if exists responsibilities,
  drop column if exists certifications,
  drop column if exists education;

alter table public.jobs
  drop constraint if exists jobs_minimum_match_score_check,
  drop column if exists archived_at,
  drop column if exists minimum_match_score,
  drop column if exists employment_type,
  drop column if exists location,
  drop column if exists department,
  drop column if exists workspace_id;

drop table if exists public.workspace_members;
drop table if exists public.workspaces;
drop function if exists private.approve_hr_user(text);
drop function if exists private.shares_workspace(uuid);
drop function if exists private.is_workspace_member(uuid);
drop schema if exists private;

commit;
