-- Reverse only the temporary existing-account test approvals.
-- Accounts explicitly approved later through private.approve_hr_user are unaffected.

begin;

delete from public.workspace_members membership
using auth.users users, private.hr_access_allowlist allowlist
where membership.user_id = users.id
  and membership.workspace_id = '00000000-0000-0000-0000-000000000001'
  and allowlist.email = lower(users.email)
  and allowlist.provisioning_batch = 'existing_accounts_testing_20260827';

delete from private.hr_access_allowlist
where provisioning_batch = 'existing_accounts_testing_20260827';

commit;
