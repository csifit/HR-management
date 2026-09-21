# Safe checkpoint — 21 September 2026

## Current: Phase 3 leave and attendance

This section supersedes the historical notes below. The user requested leave/attendance and chose **daily records + leave approvals**, not clock-in/out. Keep verification focused to conserve usage; the user offered to run further commands themselves.

- Implemented `/leave`, `/leave/new`, `/leave/settings`, `/attendance` and `/attendance/edit`, with Romanian/English strings, sidebar links, employee-profile links and a pending-leave dashboard card.
- Annual, medical and unpaid types are seeded by the new migration. HR can create other types and rename/disable existing ones. Category and allowance behavior are immutable to preserve history.
- Linked employees request their own full working days; HR/owners can submit for staff. HR/owners or assigned managers approve/reject others' requests; self approval is denied. Employee cancellation is limited to pending requests; HR/owners can cancel approved leave too. Rejection/cancellation requires a reason.
- Yearly allowances are entered by HR, including agreed carryover. Pending and approved requests reserve balance. Requests snapshot working dates, reject overlaps and stay within one calendar year. Default calendar is Monday–Friday; HR must enter public holidays and company exceptions. No automatic statutory entitlement/accrual or holiday import is claimed.
- HR/owners and assigned managers record daily planned/worked hours and full-day absence categories. Default plan is 8 hours per working day, editable per date. Missing records are not counted as worked. Approved leave flows into monthly attendance and conflicting records are rejected. No payroll, clock-in/out, half-day leave or recurring employee schedules.
- All time tables have tenant RLS and checked write RPCs. Organisation locking coordinates reservations/decisions/calendar/attendance with suspension/blocking. Decision/attendance versions reject stale edits. Superadmin does not bypass employee access. Audit records actor/action and changed field names, without copying decision notes.
- Added `supabase/migrations/202609200004_leave_attendance.sql`, the time components/types/validation/actions, `tests/time-workflows.test.mjs`, and `tests/live-time-smoke.sql`. Updated README, architecture and roadmap with setup instructions and limits.
- Validation: full 28-test suite passed; after adding the live rollback-script test, all 9 focused time tests passed (20 existing + 9 time tests now present). ESLint and production build passed. Final small UI fixes preserve form values after errors and let managers request their own leave while viewing assigned staff; TypeScript passed again after these fixes. `git diff --check` passed. No reason to rerun all prior checks merely on resume.
- **Migration 4 is now applied remotely.** The user reconnected the CLI and replied ready. Migration listing confirmed project `mlgnmdhfhybhzzcoxmtr` had only migration 4 pending; `npx supabase db push --linked --yes` applied it successfully. The earlier 403 is resolved.
- Supabase schema lint found no errors. `tests/live-time-smoke.sql` passed against the linked database for balances, working dates, self-approval rejection, assigned-manager approval, attendance projection/conflicts, stale updates, tenant isolation and audit. All smoke-test fixtures were rolled back. The same script had already passed locally in PGlite with rollback verification.
- Git was clean at the start of this phase at `6bfee14` (`superadmin??`), so previous Superadmin work is now committed. Phase 3 files remain local and uncommitted. No commit, push or Vercel deployment was made. The development server is running at `http://localhost:3000` (exec session `31465`).
- Browser navigation to `/leave` correctly redirected to `/login`: the local session needs a fresh sign-in. The user chose **“I'll check the screens myself”**. The preview is left open for their manual check; do not ask for sign-in again or repeat UI checks unless requested. No authenticated Phase 3 browser check was performed by the agent.
- No real tenant employee, allowance, calendar or attendance records were changed. Preserve Cozumel SRL and the owner's confirmed account. Migration setup added only the default leave types to existing tenants.

### Resume from here

1. Read current Git status and any results from the user's manual screen check; preserve intervening changes. Database migration and live checks are complete; do not repeat them without a relevant change.
2. The user is checking `/leave`, calendar/settings/request screens and `/attendance` themselves. The local server is running; restart `npm run dev` only if needed. Stop dev before any build to avoid generated-route conflicts. Never ask for a password or suspend/block the real company to test.
3. Address any issue the user reports. The owner must configure real allowances and holidays/company exceptions before using leave requests.
4. The owner can commit/push for Vercel deployment when ready. The required database migration is already in place, but the Phase 3 frontend is not yet deployed.
5. Benefits is the next roadmap phase; Stripe/trials remain separate requirements below. Do not begin them without the user's next direction.

## Historical checkpoint — 20 September 2026

Work originally paused at the user's request to conserve remaining usage. Core signed-in checks are complete. The user then requested Expanded Superadmin controls and confirmed continuation.

## Expanded Superadmin — current implementation

- Implemented a separate `/platform` layout that requires only a provisioned platform administrator, with no tenant-membership dependency. A signed-in Superadmin without memberships is routed there automatically.
- Organisation overview uses compact expandable rows, name/CUI search, status filters, 25-row pagination, employee/account counts and owner emails. Romanian and English strings are included; existing white-label branding is retained.
- Expanded rows contain legal name/CUI, trade register number, registered address, city, county and business contact details. `/platform/new` creates a company and assigns an already registered, confirmed owner atomically. The administrator is not automatically granted tenant membership.
- Active/suspended/blocked access controls require a reason and an explicit UI acknowledgement. Suspension allows role-scoped reads but denies HR, organisation and membership changes. Blocking denies HR reads, including directory RPCs, while preserving organisation switching/sign-out and separate Superadmin access. Restoration preserves all records.
- Database policies, security-definer RPC checks and write guards enforce these restrictions independently of the UI. Row locks serialize writes with status changes; organisation versions reject stale Superadmin edits. CUI uniqueness treats the optional `RO` prefix as the same company identity.
- Organisation audit records include the actor, changed field names, status transitions and reasons. The Superadmin UI displays the latest 10 organisation events; full audit history remains stored. HR/salary records are not exposed by platform RPCs.
- Applied `202609200003_platform_controls.sql` to linked Supabase project `mlgnmdhfhybhzzcoxmtr`. The existing organisation defaults to active. A read-only preflight found no duplicate CUIs.
- Verification: all 20 automated tests passed, ESLint and production build passed, and Supabase schema lint found no errors. `tests/live-platform-smoke.sql` passed against Supabase for creation, role checks, suspension, blocking, restoration, stale edits and audit. Its users, administrator grant, organisation, employee/contract and audit events were rolled back.
- Signed-in browser check completed after the user signed in locally: the Superadmin list loads Cozumel SRL as active; its accordion expands to show company fields, owner, access controls, reason/confirmation inputs and audit history; the new-organisation form includes the confirmed-owner field. The narrow browser layout was visually checked. This was a read-only UI check, with no live company changes. At the user's request to conserve usage, builds/tests were not repeated; mutation behavior is covered by the earlier database tests. The development server is running on port 3000. Initial stale generated route files caused a temporary 404/type-generation failure; a fresh build and dev restart resolved it.
- Frontend changes are still local and uncommitted/unpushed; no new Vercel deployment was made. The SQL migration is already live and backward-compatible with the existing active tenant. Do not claim the new interface is live at `www.mkdir.space` yet.
- Preserve earlier pending changes: production-only Supabase auth config, `.gitignore`, README/checkpoint updates and numeric-zero rendering fix. Stripe/trials, REGES integration and Phase 3 are outside this change.

## Resume review — verified current state

- GitHub is connected at `https://github.com/csifit/HR-management.git`, on `master` tracking `origin/master`. Latest local commit checked: `4dc7bb9` (`ignore`), after initial commit `8d96105`.
- The production application is reachable at `https://www.mkdir.space` and redirects unauthenticated visitors to the HRConnector sign-in screen at `/login`.
- The only working-tree change at the start of this review was this checkpoint file, containing the user's new requirements below.
- Supabase CLI initially returned HTTP 403; the user reconnected it and access now works for the correct project `mlgnmdhfhybhzzcoxmtr`. Migration listing confirms both local migrations are applied remotely.
- The user signed in on production. Cozumel SRL exists, the owner dashboard loads, and the Superadmin page successfully lists the organisation.
- Signed-in browser verification passed: create a separate QA organisation, add an employee, create a draft contract, change its salary, and view employee/contract/salary audit events. Switching back to Cozumel SRL correctly returns 404 for the QA employee URL.
- The QA organisation and its one employee, draft contract, membership and audit fixtures were removed after testing, guarded by exact IDs and identity/content assertions. Cleanup verified that Cozumel SRL was preserved. The browser is left on Cozumel SRL's dashboard.
- Source review confirms the existing `/platform` page sits inside the tenant workspace layout. A Superadmin without an organisation membership is therefore redirected to organisation onboarding. Remove this dependency as part of the Superadmin work.
- Found and fixed production auth URLs pointing to localhost. Applied the separate config at `supabase/environments/production/supabase/config.toml`: Site URL is `https://www.mkdir.space`, production confirmation/recovery callbacks are allowed, and local callbacks are retained. A follow-up config diff reports zero declared updates. Other remote settings were preserved.
- Vercel's environment-variable value has not been inspected. It must be `NEXT_PUBLIC_SITE_URL=https://www.mkdir.space`, not `PUBLIC_SITE_URL`. Email delivery/recovery itself was not exercised by sending test messages.
- Fixed a source-only display defect: numeric zero now renders as `0`, so a zero-day probation period is not replaced with `—`. Production build and ESLint passed. This UI fix still needs committing/pushing and deployment; the Supabase URL correction is already live.
- Changes from this review are limited to `docs/checkpoint.md`, `README.md`, the separate production Supabase config, `.gitignore` entries for its CLI temporary files, and the numeric-zero fix in `src/components/ui.tsx`. Expanded Superadmin controls, subscriptions and Phase 3 have not started.

## User's additional requirements

- Repository: `https://github.com/csifit/HR-management`.
- Production site URL: `https://www.mkdir.space`. The application currently reads `NEXT_PUBLIC_SITE_URL`; use that exact environment-variable name in Vercel.
- Superadmin: `cs.farkas7@gmail.com`. The user wants a compact organisation overview with expandable single-row accordions, organisation suspension/blocking, and the ability to add/edit organisation information to help onboarding and future REGES connection.
- Subscriptions: Stripe is preferred, with a 30-day free trial. Pricing is not final; the working proposal is €2 per employee per month.
- Billing example: an employee added on 3 September is first charged in October; charge for full months only. Confirm trial-to-paid timing and employee removal/suspension rules when implementing billing. Do not treat the provisional price as an approved live charge.
- Continue Phase 3 after the core tests. REGES, payroll, benefits, documents, leave and attendance remain later planned work until their phase is implemented.

Expanded Superadmin requirements are now implemented as recorded above. Trials and Stripe billing remain requirements, not completed functionality.

## Delivered

- Phase 1 and initial Phase 2 implementation: authentication, organisation creation/switching, roles/RLS, dashboard, employee create/edit/list/profile, contract create/edit, salary visibility, audit history, owner-managed account linking.
- Product name HRConnector; deployment-wide white-label name/logo/theme configuration and Romanian/English UI.
- Linked Supabase project: `mlgnmdhfhybhzzcoxmtr` (HRConnector).
- All three migrations are applied: `202609200001_core_hr.sql`, `202609200002_directory_details.sql`, and `202609200003_platform_controls.sql`.
- Supabase authentication has production and localhost confirmation/recovery redirect URLs and a 10-character minimum password. Existing undeclared remote settings were preserved.
- The user's confirmed account has been provisioned in `private.platform_admins`. No public UI or user metadata can grant platform access.
- `.env.local` is configured and Git-ignored. No service-role key is used in the app.

## Verification

- 14 automated input-validation and real PostgreSQL/RLS tests passed.
- Live Supabase transaction-based smoke test passed; its test users, organisations, employee rows, and audit events were rolled back.
- Supabase schema lint found no errors for the core migration.
- Production build and ESLint passed again at the final handoff of the initial implementation.
- Browser checks covered desktop/mobile sign-in layout, Romanian/English switching, invalid-credential feedback against Supabase, registration rendering, and unauthenticated employee-route protection.
- Signed-in browser testing of organisation creation → employee creation → contract creation/editing is now complete, as recorded above. No test organisation or employee was left in the live project.

## Running locally and repository state

- At the original pause, the local Next.js development server was running on port 3000. Its current process status was not needed for this review, which tested the production site. For local work use `http://localhost:3000`; local 127.0.0.1 requests canonicalise to localhost for auth cookies.
- If the process is gone on resume, run `npm run dev`.
- At the original pause, Git had no commits or remote. This has since changed: the user created and connected the repository, and the source is committed. Preserve their Git setup and changes.
- At the original pause, no deployment had been made. The production application is now reachable and authenticated flows were verified. Supabase production redirects have been corrected; Vercel's environment settings still need inspection.
- `AGENTS.md` and `CLAUDE.md` were generated by Next.js 16.3.5; follow the local Next.js docs when continuing.

## Resume in this order

1. Read this note, `README.md`, `docs/architecture.md`, `docs/roadmap.md`, and the current Git status.
2. Preserve the user's GitHub setup, Cozumel SRL, and confirmed Superadmin account. CLI access and both applied migrations have been reverified; do not redo the same setup unless access changes.
3. Core signed-in creation/editing checks are complete. Preserve their results and only repeat them for relevant code changes. Do not ask for the user's password.
4. The local signed-in Superadmin rendering/navigation check is complete. The user prefers conserving usage and can run further commands/checks themselves. Do not repeat successful builds/tests without a relevant change. Never suspend/block Cozumel SRL as a test; use transaction-only fixtures or explicitly tracked disposable QA records.
5. Deliver the frontend changes, including the numeric-zero fix, through GitHub/Vercel and inspect `NEXT_PUBLIC_SITE_URL=https://www.mkdir.space`. Keep salary access and tenant-isolation checks intact. Use the separate production Supabase config and review its diff before pushing, so local URLs never overwrite production. Subscription work remains a separate change.
6. Continue Phase 3 after tests. REGES, payroll, benefits, documents, leave and attendance remain explicitly planned.

## Useful commands

```powershell
npm test
npm run lint
npm run build
npx supabase migration list
npx supabase db lint --linked --level warning
npx supabase db query --linked --file tests/live-rls-smoke.sql
npx supabase db query --linked --file tests/live-platform-smoke.sql
```
