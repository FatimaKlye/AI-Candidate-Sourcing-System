-- Security and performance follow-up from the Supabase advisors.

begin;

alter function public.set_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop policy if exists "Workspace members can manage source connections"
  on public.candidate_source_connections;
drop policy if exists "Workspace members can create source connections"
  on public.candidate_source_connections;
drop policy if exists "Workspace members can update source connections"
  on public.candidate_source_connections;
drop policy if exists "Workspace members can delete source connections"
  on public.candidate_source_connections;

create policy "Workspace members can create source connections"
  on public.candidate_source_connections for insert to authenticated
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can update source connections"
  on public.candidate_source_connections for update to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));
create policy "Workspace members can delete source connections"
  on public.candidate_source_connections for delete to authenticated
  using (private.is_workspace_member(workspace_id));

drop index if exists public.candidate_matches_job_candidate_uidx;

create index if not exists activity_logs_actor_id_idx
  on public.activity_logs (actor_id);
create index if not exists candidate_contacts_candidate_id_idx
  on public.candidate_contacts (candidate_id);
create index if not exists candidate_contacts_user_id_idx
  on public.candidate_contacts (user_id);
create index if not exists candidate_contacts_workspace_id_idx
  on public.candidate_contacts (workspace_id);
create index if not exists candidate_matches_candidate_id_idx
  on public.candidate_matches (candidate_id);
create index if not exists candidate_matches_user_id_idx
  on public.candidate_matches (user_id);
create index if not exists candidate_notes_author_id_idx
  on public.candidate_notes (author_id);
create index if not exists candidate_notes_job_id_idx
  on public.candidate_notes (job_id);
create index if not exists candidate_notes_workspace_id_idx
  on public.candidate_notes (workspace_id);
create index if not exists candidate_source_connections_workspace_id_idx
  on public.candidate_source_connections (workspace_id);
create index if not exists candidates_user_id_idx
  on public.candidates (user_id);
create index if not exists search_queries_user_id_idx
  on public.search_queries (user_id);
create index if not exists sourcing_runs_started_by_idx
  on public.sourcing_runs (started_by);
create index if not exists sourcing_runs_workspace_id_idx
  on public.sourcing_runs (workspace_id);
create index if not exists workspace_members_user_id_idx
  on public.workspace_members (user_id);

commit;
