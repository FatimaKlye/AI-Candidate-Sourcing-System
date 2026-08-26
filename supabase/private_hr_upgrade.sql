-- Private HR platform additive upgrade.
-- Safe to re-run. Existing records are preserved and assigned to the default workspace.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.hr_access_allowlist (
  email text primary key,
  active boolean not null default true,
  invited_at timestamptz not null default now(),
  constraint hr_access_allowlist_lowercase_email check (email = lower(email))
);

revoke all on private.hr_access_allowlist from public, anon, authenticated;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  settings jsonb not null default '{"weights":{"required_skills":45,"experience":25,"location":15,"seniority":10,"preferred_skills":5},"default_minimum_match_score":70}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

insert into public.workspaces (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001',
  'Private HR Workspace',
  'private-hr-workspace'
)
on conflict (id) do nothing;

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function private.shares_workspace(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user_id
  );
$$;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.shares_workspace(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.shares_workspace(uuid) to authenticated;

create or replace function private.approve_hr_user(target_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.hr_access_allowlist (email, active)
  values (lower(trim(target_email)), true)
  on conflict (email) do update set active = true;

  insert into public.workspace_members (workspace_id, user_id)
  select '00000000-0000-0000-0000-000000000001', users.id
  from auth.users users
  where lower(users.email) = lower(trim(target_email))
  on conflict do nothing;
end;
$$;

revoke all on function private.approve_hr_user(text) from public, anon, authenticated;

alter table public.jobs
  add column if not exists workspace_id uuid references public.workspaces (id),
  add column if not exists department text,
  add column if not exists location text,
  add column if not exists employment_type text,
  add column if not exists minimum_match_score integer not null default 70,
  add column if not exists archived_at timestamptz;

update public.jobs
set workspace_id = '00000000-0000-0000-0000-000000000001'
where workspace_id is null;

alter table public.jobs alter column workspace_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'jobs_minimum_match_score_check'
  ) then
    alter table public.jobs add constraint jobs_minimum_match_score_check
      check (minimum_match_score between 0 and 100);
  end if;
end $$;

alter table public.job_requirements
  add column if not exists education text not null default 'Not Specified',
  add column if not exists certifications text[] not null default '{}',
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists version integer not null default 1;

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  current_title text not null default 'Not Found',
  current_company text not null default 'Not Found',
  location text not null default 'Not Found',
  profile_url text,
  source text not null default 'Not Found',
  source_url text,
  snippet text,
  created_at timestamptz not null default now()
);

alter table public.candidates
  add column if not exists workspace_id uuid references public.workspaces (id),
  add column if not exists resume_path text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists years_experience numeric(5,2),
  add column if not exists seniority text,
  add column if not exists availability text,
  add column if not exists status text not null default 'New',
  add column if not exists updated_at timestamptz not null default now();

update public.candidates c
set workspace_id = j.workspace_id
from public.jobs j
where j.id = c.job_id and c.workspace_id is null;

alter table public.candidates alter column workspace_id set not null;

create table if not exists public.candidate_matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  overall_score integer not null default 0,
  must_have_score integer not null default 0,
  experience_score integer not null default 0,
  industry_score integer not null default 0,
  skills_score integer not null default 0,
  seniority_score integer not null default 0,
  location_score integer not null default 0,
  preferred_score integer not null default 0,
  strengths text[] not null default '{}',
  missing_requirements text[] not null default '{}',
  analysis jsonb not null default '[]'::jsonb,
  shortlisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_matches
  add column if not exists workspace_id uuid references public.workspaces (id),
  add column if not exists matched_skills text[] not null default '{}',
  add column if not exists explanation text,
  add column if not exists review_status text not null default 'New',
  add column if not exists follow_up_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists score_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists requirements_version integer not null default 1;

update public.candidate_matches cm
set workspace_id = j.workspace_id
from public.jobs j
where j.id = cm.job_id and cm.workspace_id is null;

alter table public.candidate_matches alter column workspace_id set not null;

create unique index if not exists candidate_matches_job_candidate_uidx
  on public.candidate_matches (job_id, candidate_id);

create table if not exists public.candidate_contacts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  email_status text not null default 'Not Found',
  phone text,
  phone_status text not null default 'Not Found',
  source_name text,
  source_url text,
  confidence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.candidate_contacts
  add column if not exists workspace_id uuid references public.workspaces (id),
  add column if not exists contact_method text,
  add column if not exists contacted_at timestamptz,
  add column if not exists contact_notes text;

update public.candidate_contacts cc
set workspace_id = j.workspace_id
from public.jobs j
where j.id = cc.job_id and cc.workspace_id is null;

alter table public.candidate_contacts alter column workspace_id set not null;

create table if not exists public.candidate_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_source_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  source_type text not null,
  status text not null default 'Not configured',
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sourcing_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  started_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued',
  provider text not null default 'n8n',
  n8n_execution_id text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists jobs_workspace_created_at_idx
  on public.jobs (workspace_id, created_at desc);
create index if not exists candidates_workspace_created_at_idx
  on public.candidates (workspace_id, created_at desc);
create index if not exists candidate_matches_workspace_score_idx
  on public.candidate_matches (workspace_id, overall_score desc);
create index if not exists candidate_notes_candidate_created_at_idx
  on public.candidate_notes (candidate_id, created_at desc);
create index if not exists activity_logs_workspace_created_at_idx
  on public.activity_logs (workspace_id, created_at desc);
create index if not exists sourcing_runs_job_created_at_idx
  on public.sourcing_runs (job_id, created_at desc);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_matches enable row level security;
alter table public.candidate_contacts enable row level security;
alter table public.candidate_notes enable row level security;
alter table public.activity_logs enable row level security;
alter table public.candidate_source_connections enable row level security;
alter table public.sourcing_runs enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Workspace members can view profiles" on public.profiles;
create policy "Workspace members can view profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace(id));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Workspace members can view workspace" on public.workspaces;
create policy "Workspace members can view workspace"
  on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));

drop policy if exists "Workspace members can update workspace" on public.workspaces;
create policy "Workspace members can update workspace"
  on public.workspaces for update to authenticated
  using (private.is_workspace_member(id))
  with check (private.is_workspace_member(id));

drop policy if exists "Workspace members can view membership" on public.workspace_members;
create policy "Workspace members can view membership"
  on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Users can view own jobs" on public.jobs;
drop policy if exists "Users can insert own jobs" on public.jobs;
drop policy if exists "Users can update own jobs" on public.jobs;
drop policy if exists "Users can delete own jobs" on public.jobs;
drop policy if exists "Workspace members can view requisitions" on public.jobs;
drop policy if exists "Workspace members can create requisitions" on public.jobs;
drop policy if exists "Workspace members can update requisitions" on public.jobs;
drop policy if exists "Workspace members can delete requisitions" on public.jobs;
create policy "Workspace members can view requisitions"
  on public.jobs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can create requisitions"
  on public.jobs for insert to authenticated
  with check (
    private.is_workspace_member(workspace_id)
    and user_id = (select auth.uid())
  );
create policy "Workspace members can update requisitions"
  on public.jobs for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can delete requisitions"
  on public.jobs for delete to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Users can view own job requirements" on public.job_requirements;
drop policy if exists "Users can insert own job requirements" on public.job_requirements;
drop policy if exists "Users can update own job requirements" on public.job_requirements;
drop policy if exists "Users can delete own job requirements" on public.job_requirements;
drop policy if exists "Workspace members can view requirements" on public.job_requirements;
drop policy if exists "Workspace members can create requirements" on public.job_requirements;
drop policy if exists "Workspace members can update requirements" on public.job_requirements;
drop policy if exists "Workspace members can delete requirements" on public.job_requirements;
create policy "Workspace members can view requirements"
  on public.job_requirements for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));
create policy "Workspace members can create requirements"
  on public.job_requirements for insert to authenticated
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));
create policy "Workspace members can update requirements"
  on public.job_requirements for update to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ))
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));
create policy "Workspace members can delete requirements"
  on public.job_requirements for delete to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));

drop policy if exists "Users can view own search queries" on public.search_queries;
drop policy if exists "Users can insert own search queries" on public.search_queries;
drop policy if exists "Users can update own search queries" on public.search_queries;
drop policy if exists "Users can delete own search queries" on public.search_queries;
drop policy if exists "Workspace members can view search queries" on public.search_queries;
drop policy if exists "Workspace members can create search queries" on public.search_queries;
drop policy if exists "Workspace members can update search queries" on public.search_queries;
drop policy if exists "Workspace members can delete search queries" on public.search_queries;
create policy "Workspace members can view search queries"
  on public.search_queries for select to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));
create policy "Workspace members can create search queries"
  on public.search_queries for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
      where j.id = job_id and private.is_workspace_member(j.workspace_id)
    )
  );
create policy "Workspace members can update search queries"
  on public.search_queries for update to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ))
  with check (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));
create policy "Workspace members can delete search queries"
  on public.search_queries for delete to authenticated
  using (exists (
    select 1 from public.jobs j
    where j.id = job_id and private.is_workspace_member(j.workspace_id)
  ));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['candidates','candidate_matches','candidate_contacts']
  loop
    execute format('drop policy if exists "Users can view own %s" on public.%I', replace(table_name, '_', ' '), table_name);
    execute format('drop policy if exists "Users can insert own %s" on public.%I', replace(table_name, '_', ' '), table_name);
    execute format('drop policy if exists "Users can update own %s" on public.%I', replace(table_name, '_', ' '), table_name);
    execute format('drop policy if exists "Users can delete own %s" on public.%I', replace(table_name, '_', ' '), table_name);
  end loop;
end $$;

drop policy if exists "Workspace members can view candidates" on public.candidates;
drop policy if exists "Workspace members can create candidates" on public.candidates;
drop policy if exists "Workspace members can update candidates" on public.candidates;
drop policy if exists "Workspace members can delete candidates" on public.candidates;
create policy "Workspace members can view candidates"
  on public.candidates for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can create candidates"
  on public.candidates for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
create policy "Workspace members can update candidates"
  on public.candidates for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can delete candidates"
  on public.candidates for delete to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can view candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can create candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can update candidate matches" on public.candidate_matches;
drop policy if exists "Workspace members can delete candidate matches" on public.candidate_matches;
create policy "Workspace members can view candidate matches"
  on public.candidate_matches for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can create candidate matches"
  on public.candidate_matches for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
create policy "Workspace members can update candidate matches"
  on public.candidate_matches for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can delete candidate matches"
  on public.candidate_matches for delete to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can view candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can create candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can update candidate contacts" on public.candidate_contacts;
drop policy if exists "Workspace members can delete candidate contacts" on public.candidate_contacts;
create policy "Workspace members can view candidate contacts"
  on public.candidate_contacts for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can create candidate contacts"
  on public.candidate_contacts for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and user_id = (select auth.uid()));
create policy "Workspace members can update candidate contacts"
  on public.candidate_contacts for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can delete candidate contacts"
  on public.candidate_contacts for delete to authenticated
  using (private.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can view candidate notes" on public.candidate_notes;
drop policy if exists "Workspace members can add candidate notes" on public.candidate_notes;
create policy "Workspace members can view candidate notes"
  on public.candidate_notes for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can add candidate notes"
  on public.candidate_notes for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and author_id = (select auth.uid()));

drop policy if exists "Workspace members can view activity" on public.activity_logs;
drop policy if exists "Workspace members can add activity" on public.activity_logs;
create policy "Workspace members can view activity"
  on public.activity_logs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can add activity"
  on public.activity_logs for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and actor_id = (select auth.uid()));

drop policy if exists "Workspace members can view source connections" on public.candidate_source_connections;
drop policy if exists "Workspace members can manage source connections" on public.candidate_source_connections;
create policy "Workspace members can view source connections"
  on public.candidate_source_connections for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can manage source connections"
  on public.candidate_source_connections for all to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

drop policy if exists "Workspace members can view sourcing runs" on public.sourcing_runs;
drop policy if exists "Workspace members can create sourcing runs" on public.sourcing_runs;
drop policy if exists "Workspace members can update sourcing runs" on public.sourcing_runs;
create policy "Workspace members can view sourcing runs"
  on public.sourcing_runs for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy "Workspace members can create sourcing runs"
  on public.sourcing_runs for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and started_by = (select auth.uid()));
create policy "Workspace members can update sourcing runs"
  on public.sourcing_runs for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

insert into storage.buckets (id, name, public)
values ('candidate-resumes', 'candidate-resumes', false)
on conflict (id) do nothing;

drop policy if exists "Users can read own JD files" on storage.objects;
drop policy if exists "Workspace members can read JD files" on storage.objects;
create policy "Workspace members can read JD files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-descriptions'
    and exists (
      select 1 from public.jobs j
      where j.file_path = name and private.is_workspace_member(j.workspace_id)
    )
  );

drop policy if exists "Workspace members can read resumes" on storage.objects;
drop policy if exists "Workspace members can upload resumes" on storage.objects;
drop policy if exists "Workspace members can update resumes" on storage.objects;
drop policy if exists "Workspace members can delete resumes" on storage.objects;
create policy "Workspace members can read resumes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.user_id = (select auth.uid())
    )
  );
create policy "Workspace members can upload resumes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.user_id = (select auth.uid())
    )
  );
create policy "Workspace members can update resumes"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.user_id = (select auth.uid())
    )
  );
create policy "Workspace members can delete resumes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'candidate-resumes'
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id::text = (storage.foldername(name))[1]
        and wm.user_id = (select auth.uid())
    )
  );

create or replace function private.add_invited_user_to_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from private.hr_access_allowlist allowlist
    where allowlist.email = lower(coalesce(new.email, ''))
      and allowlist.active
  ) then
    insert into public.workspace_members (workspace_id, user_id)
    values ('00000000-0000-0000-0000-000000000001', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.add_invited_user_to_default_workspace() from public, anon, authenticated;

drop trigger if exists on_private_hr_user_created on auth.users;
create trigger on_private_hr_user_created
  after insert on auth.users
  for each row execute function private.add_invited_user_to_default_workspace();

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at before update on public.workspaces
  for each row execute function public.set_updated_at();
drop trigger if exists set_candidates_updated_at on public.candidates;
create trigger set_candidates_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
drop trigger if exists set_candidate_matches_updated_at on public.candidate_matches;
create trigger set_candidate_matches_updated_at before update on public.candidate_matches
  for each row execute function public.set_updated_at();
drop trigger if exists set_candidate_contacts_updated_at on public.candidate_contacts;
create trigger set_candidate_contacts_updated_at before update on public.candidate_contacts
  for each row execute function public.set_updated_at();
drop trigger if exists set_candidate_source_connections_updated_at on public.candidate_source_connections;
create trigger set_candidate_source_connections_updated_at before update on public.candidate_source_connections
  for each row execute function public.set_updated_at();

revoke all on public.workspaces, public.workspace_members, public.jobs,
  public.job_requirements, public.search_queries, public.candidates,
  public.candidate_matches, public.candidate_contacts, public.candidate_notes,
  public.activity_logs, public.candidate_source_connections, public.sourcing_runs
  from anon;

grant select, update on public.profiles to authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on public.jobs, public.job_requirements,
  public.search_queries, public.candidates, public.candidate_matches,
  public.candidate_contacts, public.candidate_source_connections to authenticated;
grant select, insert on public.candidate_notes, public.activity_logs to authenticated;
grant select, insert, update on public.sourcing_runs to authenticated;

insert into public.activity_logs (
  workspace_id, actor_id, event_type, entity_type, metadata
)
select
  '00000000-0000-0000-0000-000000000001',
  null,
  'workspace_initialized',
  'workspace',
  '{"source":"private_hr_upgrade"}'::jsonb
where not exists (
  select 1 from public.activity_logs
  where event_type = 'workspace_initialized'
    and workspace_id = '00000000-0000-0000-0000-000000000001'
);

commit;
