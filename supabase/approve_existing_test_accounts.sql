-- Approve only the accounts that exist when this migration is run.
-- Future accounts are not included and remain blocked until explicitly approved.

begin;

insert into private.hr_access_allowlist (
  email,
  active,
  provisioning_batch
)
select
  lower(users.email),
  true,
  'existing_accounts_testing_20260827'
from auth.users users
where users.email is not null
on conflict (email) do update
set active = true,
    provisioning_batch = excluded.provisioning_batch;

insert into public.workspace_members (workspace_id, user_id)
select
  '00000000-0000-0000-0000-000000000001',
  users.id
from auth.users users
join private.hr_access_allowlist allowlist
  on allowlist.email = lower(users.email)
where allowlist.active
  and allowlist.provisioning_batch = 'existing_accounts_testing_20260827'
on conflict do nothing;

commit;
