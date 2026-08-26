# Reversing the Private HR Upgrade

The implementation was intentionally isolated and paired with database rollback SQL.

## Git checkpoint

- Original code: `backup/pre-private-hr-rebuild-20260826`
- New implementation: `codex/private-hr-platform`

After the implementation is committed, use `git revert <commit>` to reverse the code without rewriting history. Do not use `git reset --hard`.

## Database rollback

Run `supabase/private_hr_rollback.sql` through the Supabase SQL editor or an approved migration workflow.

The rollback script first copies the new workspace, notes, activity, source-connection, sourcing-run, and allowlist data into the isolated `private_hr_rollback_20260826` schema. It then restores the original owner-only policies and removes the additive columns and tables.

Uploaded resume files are not deleted by the rollback. This prevents irreversible loss of candidate documents. Their access policies are removed, leaving the bucket inaccessible until intentionally restored or cleaned up.

## Authorization safety

The upgrade does not automatically authorize existing or newly created accounts. Provisioning must explicitly call:

```sql
select private.approve_hr_user('approved.hr@company.com');
```

Run that statement before inviting a new HR user, or after confirming an existing account is organization-approved.
