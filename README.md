# TalentAI — Private HR Candidate Sourcing

TalentAI is an invitation-only recruitment workspace for organization-approved HR personnel. It processes job descriptions, starts sourcing through approved integrations, calculates auditable candidate-match scores, and supports shared HR review, shortlists, notes, follow-ups, and activity history.

There is no public registration, applicant portal, public job page, internet-wide scraping, or in-application administrator role.

## Core flow

```text
Approved HR login
→ Create job requisition
→ Upload or paste job description
→ Review Ollama-extracted requirements
→ Start approved n8n sourcing workflow or add an authorized candidate record
→ Calculate deterministic match score
→ Review, shortlist, annotate, and record follow-up
```

## Technology responsibilities

- **Next.js** — private HR interface, authenticated server actions, requisitions, candidates, shortlists, notes, activity, and settings.
- **Supabase Auth/PostgreSQL/Storage** — invitation-backed identity, workspace membership, RLS, recruitment records, and private documents.
- **n8n** — approved candidate-source orchestration. The application never scrapes LinkedIn or the open internet.
- **Ollama** — structured job-description extraction. Numeric match scores remain deterministic and auditable.

## Local setup

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the Supabase project URL and publishable key.
3. Run `supabase/schema.sql` for the legacy base tables on a fresh project.
4. Run `supabase/private_hr_upgrade.sql` through an approved Supabase migration workflow.
5. Explicitly approve an HR email before inviting or granting access:

   ```sql
   select private.approve_hr_user('approved.hr@company.com');
   ```

   For a controlled test environment, `supabase/approve_existing_test_accounts.sql` approves only the accounts present when it runs. Its matching revoke script removes that test batch independently.

6. Disable public user signups in Supabase Authentication settings. Invitations remain managed externally.
7. Start Ollama and ensure the configured model is installed.
8. Optionally set `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_TOKEN` for approved-source workflows.
9. Run `npm run dev` and open `http://localhost:3000`.

## Main navigation

- Dashboard
- Job Requisitions
- Matched Applicants
- Shortlisted
- Candidate Pool
- Activity
- Settings

## Privacy and decision rules

- Candidate and requisition data is restricted to approved workspace members by RLS.
- HR review is required before candidate contact or hiring decisions.
- Protected or sensitive personal characteristics are not matching inputs.
- LinkedIn information must come from an authorized integration or an HR-supplied approved profile URL.
- Activity records provide team transparency.
- All HR users have the same application permissions; provisioning is external.

## Reversal

See [REVERSAL.md](REVERSAL.md). The original code is preserved on `backup/pre-private-hr-rebuild-20260826`, and the database upgrade has a paired rollback script that snapshots new HR data before restoring the previous schema and policies.
