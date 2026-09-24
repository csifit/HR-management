# Safe checkpoint — 24 September 2026

## Current state — recurring work schedules

**This section supersedes the older resume instructions below.** The user explicitly selected recurring organisation/employee work schedules as the next feature. Started from clean commit **`a9f03ad` (`employeee page`)**, which contains the employee-screen changes. This implementation is local and uncommitted.

### Implementation

- **Migration 013:** `202609240013_recurring_work_schedules.sql` adds effective-dated organisation/employee weekday schedules. Monday–Friday remains the default; individual patterns override company weekdays, and an explicit inheritance entry restores company rules. Date exceptions have highest priority.
- HR/owners manage schedules under **Attendance → Work schedules** (`/attendance/settings`), with links from Attendance and Leave settings. RO/EN, current weekday summary, paginated history, future edits and read-only past entries are included. Managers retain attendance correction rights but cannot modify recurring schedules; employees retain their own read-only calendar.
- New/edited schedule dates must be today or later (Europe/Bucharest). Earlier rules remain intact. The shared organisation lock, version checks, tenant/MFA/status checks and audit trail protect writes. Clients have SELECT only on the new table. No service-role use or automatic email.
- Leave requests and automatic attendance resolve the employee's effective pattern. Changes conflicting with pending/approved leave roll back and require cancellation/resubmission first. Manual attendance is preserved, including manually recorded work on an otherwise non-working day. Benefit drafts reflect resulting attendance; approved snapshots stay fixed.
- The current payroll calculator assumes Monday–Friday. Payslip generation checks the whole selected month's recurring pattern and refuses unsupported patterns for payroll review. This does not add tax calculations for compressed/six-day weeks.
- No rotating shifts, varying daily hours, automatic holiday import, backdated schedule editing or immutable monthly attendance ledger. Contract hours still determine daily hours; other existing contract/calendar-date edits can affect derived history.

### Verification and deployment

- **80 distinct tests verified:** the full suite passed 79/80 initially; the new benefits fixture expectation omitted its pre-existing manual Friday work. After fixing that test expectation, all **20 benefits/schedule tests passed** on a focused rerun. No production logic changed after the full run. Coverage includes effective dates/inheritance, leave rollback, automatic/manual hours, benefits, permissions, tenant boundaries, MFA/status restrictions, stale updates and payroll scope.
- **Production build and TypeScript passed**, including `/attendance/settings`. Full ESLint had no errors and one unused fixture variable warning; the variable was removed and targeted ESLint passed. Manual signed-in UI checks remain with the user. No server was started/stopped.
- A read-only `npx supabase migration list` check returned **HTTP 403 privileges/access denied**. This is not proof of logout; do not repeatedly ask for login or blindly repair/reapply migrations. Remote history remains unverified.
- **Next release action:** check remote history and apply migration **013 after 001–012**, then deploy this frontend. Migration 013 has NOT been applied remotely by the assistant. No commit/push/deployment, live HR mutation or actual email occurred.
- Setup, precedence and manual checks: `docs/work-schedules.md`. README, architecture, roadmap and payroll scope were updated. Preserve the user's instruction: **never run `npm run dev`, start another server or stop their server**.

---

## Earlier state — employee workspace views

**This section supersedes the older resume instructions below.** Started from the user's clean commit **`587cb28` (`employee onboerding a minor changes`)**, which contains the earlier onboarding/attendance work. The latest request is to simplify the employee sidebar/dashboard and show only personal contracts, leave, attendance and benefits.

### Changes

- Employee sidebar hides Employees and planned Integrations. Direct employee access to `/employees` returns to the dashboard; their own profile/contract detail remains available with a suitable back link.
- Employee dashboard loads only their pending leave count and **My department** (department, job title, workplace). It skips organisational metrics, recently added employees, department counts and audit queries. “What's next for your workspace” is removed for every role.
- Contracts explicitly filter to the signed-in employee within the selected organisation. The employee column and empty-state “+ Employees” button are hidden; own contract details remain read-only.
- Leave shows only personal requests and balances, with no employee selector or approval controls. Employees can request leave and cancel their own pending requests. Unlinked accounts receive an HR-contact notice and cannot submit a request from this page.
- Employee attendance is a Monday-first monthly calendar with planned/worked hours, automatic attendance labels and approved leave. No edit controls or editable day links. HR/assigned managers retain their existing table and correction flow. The calendar scrolls within its panel on narrow screens.
- Benefits show personal enrolments and approved monthly history, with no editing or management actions. Personal views ignore employee/search URL filters and derive identity from the signed-in account. Existing database permissions remain the enforcement boundary.
- New personal-view copy is available in Romanian and English. No schema or payroll/attendance calculation changes.

### Verification and release boundaries

- **35/35 existing permission/workflow tests passed** across tenant isolation, leave/attendance and benefits, including employee-only reads, forbidden writes, approval controls and tenant boundaries. Tests use the local PGlite fixtures, not production HR data. The initial sandbox worker spawn failed with EPERM; the approved retry passed.
- **Full ESLint and production build passed**, including TypeScript and route generation. `git diff --check` passed (only normal LF/CRLF notices).
- Manual signed-in screen checks remain for the user: employee linked/unlinked accounts, RO/EN, personal contracts/leave/benefits, calendar month navigation on desktop/mobile, and an HR/manager regression check.
- Changes are local and uncommitted. No push, deployment, database mutation or email send. **No new migration is required for this UI change**; the earlier frontend still depends on migrations 011–012, whose live status was not independently checked.
- **Do not run `npm run dev`, start a server or stop the user's server.** The user manages this in VS Code. No server was started/stopped during this work.

---

## Earlier state — employee invitations, compact onboarding, attendance automation and contract review

**This section supersedes the older resume instructions below.** After the payroll/privacy work, the user asked to continue with employee invitations, a compact onboarding checklist, discreet public pricing, contract-based attendance and HR review before REGES. They explicitly chose **“Automatically count elapsed working days as worked”**, superseding the older recorded-only attendance/benefit rule.

### Repository and boundaries

- The user's newer commit **`d31829b` (`payroll  and GDPR`)** now contains the preceding payroll/provider privacy work. Preserve it and all current local/untracked changes. No commit, push, production migration, deployment or actual invitation/document email was performed by this implementation.
- **Never run `npm run dev`, start another server, or stop the user's server.** They manage it in VS Code and prefer manual screen checks. This remains in force.
- Migrations **011 and 012 are new local files and must be applied before deploying this frontend**. User-reported 008–010 application/deployment remains unverified remotely. Do not blindly reapply earlier migrations or repair their history. Earlier Supabase 403 is not proof of logout; do not keep asking for login.
- Local MXroute TLS/authentication passed earlier in this turn; no real email has been sent. Vercel SMTP and inbox delivery remain unverified. Keep all SMTP credentials private; previous rotation confirmation remains unknown.

### New implementation

1. **Employee invitations — migration 011.** Adding an active/onboarding employee in the app queues and attempts an invitation through the existing MXroute transport, and starts an onboarding checklist. Failure retains the employee. The profile shows delivery status and expiry with explicit replace/resend and revoke controls. The migration does not send mail or backfill existing staff; direct API inserts queue an invitation but there is no background sender.
2. `/join` guides account registration/sign-in, email verification and explicit acceptance. The database checks confirmed current email, pending/single-use status, seven-day expiry, MFA, active organisation/employee, account conflicts and active offboarding. It grants **employee only**, never a client-selected role, and never silently downgrades existing privileged members. UUID links are references, not bearer credentials. No service-role key is used. Email/account/status changes revoke pending invitations. Delivery attempts are reserved, rate-limited per pending invitation and explicitly recorded; renewal replaces the old invitation.
3. **Compact onboarding** in the employee profile uses the existing versioned lifecycle tasks, completion/reopen buttons, progress and a full-checklist link. Tasks remain manual HR attestations, with the existing history and close/skip controls. Failure to start a case is recoverable through the full checklist page.
4. **Automatic attendance — migration 012.** `attendance_month` derives contract hours for completed working days **before today in Europe/Bucharest**. Today and future days remain planned. Approved leave sets zero work; cancellation restores derived work. Manual records win and are never overwritten. HR/assigned managers retain per-day corrections; leave dates are corrected via the leave workflow. Missing/overlapping/inactive contracts do not create automatic work; the legacy eight-hour planning fallback remains when no unique contract exists. Historical terminated contracts require an explicit end date; suspension/change history is not reconstructed.
5. Automatic rows are labelled `automatic` and feed benefit drafts. `private.benefit_sources` adds an automatic-attendance review flag; the full source snapshot still rejects stale approval and approved months keep their saved amounts. No cron or fabricated clock events. Contract/calendar edits can change unoverridden derived history, so this is not an immutable attendance ledger.
6. **Contract HR review — migration 012.** The Contract tab records reviewer/time/current `review_version`. Every contract edit increments its database-maintained revision and makes the prior review stale. Direct calls enforce HR/tenant/access-state checks and clients cannot forge the review or revision. REGES remains disconnected. Future queue creation must check approval atomically and review all additional mapped payload data too.
7. **Public homepage** for logged-out visitors, with discreet €2/employee/month pricing and tax details deferred to the offer. Signed-in users still continue to the dashboard. The separate `/hr-management-romania` page remains without inbound navigation/footer links. Both public pages are in the sitemap.
8. Added invitation Auth return paths and production/local redirect allowlist entries in their separate Supabase config files. README, architecture, roadmap, REGES plan and `docs/onboarding-automation.md` describe deployment, manual checks and actual limitations.

### Checks and release status

- **Full suite: 70/70 tests passed**, including new verified-email/role/expiry/MFA/offboarding invitation cases, automatic attendance/calendar/leave/manual/future/ambiguous-contract cases, stale HR review and benefit integration. Existing database/Storage/payroll/PDF regressions also passed.
- **Production build passed**, including TypeScript and the new `/join` route. Full ESLint found one render-time clock usage and an unused test variable; both were fixed, and targeted ESLint passed. The final UI change displays the stored expiry timestamp instead of evaluating a render-time clock. No business calculation changed after the full suite.
- UI/browser and real email delivery remain for the user's manual checks. No server was started/stopped. The earlier payslip PDF visual QA remains valid; PDFs were not changed by this phase.
- Initial Windows test-worker spawn was sandbox-blocked; the approved retry ran successfully. This was a local execution restriction, not a database or application failure.

### Next release steps

1. Review/apply `202609230011_employee_invitations.sql`, then `202609230012_attendance_contract_review.sql` after checking remote history. Do not deploy the new frontend against a schema missing them.
2. Add **`https://www.mkdir.space/auth/confirm?next=/join`** to Supabase Auth's redirect allowlist; add the localhost equivalent for local tests. The production config is prepared separately. **Never push the root localhost config to production.**
3. Verify app SMTP and `NEXT_PUBLIC_SITE_URL=https://www.mkdir.space` in Vercel, then deploy. Supabase account-confirmation emails have their own configuration. No live billing/REGES transmission was added.
4. Follow `docs/onboarding-automation.md` using a dedicated test organisation and an email controlled by the user. New employee creation now intentionally attempts real email; do not use real staff as unannounced test recipients. The user starts the server themselves.
5. Pending broader work remains fractional/partial-month payroll, privacy-pack adoption and actual export/erasure/restore procedures, real REGES integration, signing and Stripe collections reconciled to official SAGA invoices. Earlier provider/operator details and scope are preserved below.

---

## Earlier state — payroll expansion and provider privacy procedures (superseded by current release notes)

**This section supersedes all historical state and resume instructions below.** The user resumed for broader payroll and organisational/provider GDPR procedures, requested an SMTP check and an explanation of variable Stripe totals, then confirmed SAGA for official invoices.

### Working boundaries and deployment status

- **Never run `npm run dev`, start another server, or stop the user's server.** The user manages the server in VS Code and prefers manual screen checks. No server was started/stopped this turn.
- Started with a clean working tree at **`429fc69` (`payroll and reges prep`)**. This turn's changes are local and uncommitted. No commit, push, deployment, production HR mutation, Stripe operation or actual email send occurred.
- The user reports applying **008–010 and deploying to Vercel**. This report supersedes the earlier “local migrations only” status, but remote schema/history and deployment were not independently verified this turn. No new migration is needed for the current changes.
- Supabase project remains `mlgnmdhfhybhzzcoxmtr`. Earlier CLI calls returned 403; that is not proof of logout. Do not repeatedly request login, blindly reapply migrations, repair history or push the root localhost auth config.
- **MXroute local connection, TLS and authentication now pass**: `node --env-file=.env.local --experimental-strip-types scripts/verify-smtp.mjs` ran after the user's new request. It only called transport.verify(); no email was sent and no secret/provider response was printed. Vercel SMTP settings, DNS authentication and actual delivery remain unverified.
- The previous exposure of a password from `.env.example` was already remedied in the template and reported to the user. Rotation has not been independently confirmed. Never print `.env.local` or copy credentials into Git/chat.

### User decisions preserved

- First payroll expansion: **part-time salaries, meal vouchers and salary advances**. Automatic calculation stays in the app.
- Legal provider: **Cozumel SRL**, **Str. Dr. Louis Pasteur nr 38/ ap. 31, 410154, Oradea, jud. Bihor**, privacy contact **admin@mkdir.space**. `src/lib/service-provider.ts` separates legal identity from white-label brand settings.
- **SAGA issues official customer invoices; Stripe collects payments.** Billing remains a design proposal, with no live integration/charges. Price intention stays €2 per employee/month; earlier 30-day trial and September additions first billed in October remain planning inputs. Count/trial/VAT/currency/grace details still need decisions.
- Optional MFA for every role, private HR-first payslips and explicit employee email delivery remain unchanged product choices.

### Implemented this turn

1. **Payroll v2**, `RO-2026-monthly-v2`: full-month 2026 part-time minimum checks, employer-paid CAS/CASS floor shortfalls and evidenced exceptions, meal-voucher CASS/income-tax treatment without adding vouchers to cash pay, and already-paid advances subtracted only from remaining payment. The 2026 floor is 3,750/4,125; full-time minimum relief remains 300/200 with the eligibility/cash-gross caps. Personal deduction bands include vouchers.
2. RO/EN payroll fields, evidence/issuance/payment references, preview and PDF breakdown. Server generation checks a single active full-month RON contract with matching hours/basic salary, active employee and no recorded approved leave/absence. HR explicitly reviews benefits; **the old blanket active-benefit block was replaced by a declaration of actual issued vouchers and no omitted unsupported benefits**. Benefits are not auto-classified or auto-imported as issued vouchers. Changing employee resets the form.
3. Scope remains **whole-RON inputs and full months**. A genuine RON 2,162.50 part-time contract is not supported; do not round the contract to fit. Fractional earnings, partial months/leave pay, other benefits, income-tax exemptions, foreign/special cases, garnishments, structured payroll/correction ledger, D112 and bank payments remain future work. Floor exceptions do not grant tax exemptions. Accountant reference validation is still required before production reliance.
4. **Provider/organisational GDPR pack** in `docs/privacy/`: provider handbook, customer DPA draft, vendor/transfer register and empty operational register templates. Covers controller/processor roles, rights requests, incidents, verified support access, onboarding, retention/return/deletion and recovery. Completed personal-data registers belong in a restricted operational system, not Git. These are draft procedures, **not an implemented case-management/export/erasure engine or compliance certification**.
5. `/settings/data-protection` identifies Cozumel and gives HR rights-request and incident procedures. Legal/company registration, approved contracts/notices, named leads, vendor entities/DPAs/regions/transfers, retention choices, export/deletion processes and database/file backup/restoration evidence still need completion/adoption.
6. `docs/billing-proposal.md` explains one €2 Stripe price with per-company subscription quantity, immutable employee-count snapshots, no-proration next-period changes, durable renewal handling, payment confirmation, failure/SCA and SAGA reconciliation. Stripe Billing still creates invoice objects; presentation/portal/email settings must match the SAGA workflow. Stripe Payments against SAGA-approved amounts is documented as the more custom alternative if eliminating Billing invoices is required. No claim that hiding a PDF resolves legal invoicing status.
7. README, architecture, roadmap, supported payroll rules and public discovery copy updated to reflect the actual scope. Payroll source references are in `docs/payroll-rules.md`; EDPB and Stripe primary links are in their respective documents.

### Verification this turn

- **13/13 focused tests passed** across `tests/payroll.test.mjs` and `tests/document-pdf.test.mjs`, covering standard regressions, part-time employer floors/exemption, voucher tax/cash separation, advances and validation, plus PDF generation.
- **TypeScript, ESLint and production build passed.** `git diff --check` passed (normal LF/CRLF warnings only). Existing unrelated DB tests were not repeated; no migrations changed.
- Both the normal payslip and expanded part-time/voucher/advance payslip rendered as one page. Poppler renders were visually inspected for Romanian glyphs, layout, breakdown and footers. Synthetic `tmp/pdfs` intermediates were removed after checking the resolved workspace path.
- The PDF skill authoring marker already ran successfully once earlier in this conversation; **do not repeat it**.
- SMTP verify-only passed as described above. **Not tested this turn:** live new screens/Storage/Auth/MFA, actual email delivery, remote migration state or Stripe/SAGA integration. The user prefers manual screen checks.

### Next steps

1. Preserve the working tree and untracked `docs/privacy/` / `src/lib/service-provider.ts`. User can review screens and deploy these changes; no new database migration is required. No commit/push/deploy has been requested here.
2. Validate the new payroll examples against the accountant's reference calculations. Prioritise fractional earnings and partial-month/leave cases in the next separately tested rule expansion. Do not imply complete payroll coverage.
3. Complete and adopt the privacy pack: Cozumel registration details, named leads, customer DPA/notices, actual vendor/transfer evidence, retention decisions and tested access-export/erasure/restore procedures. Customer-facing contracts must not claim unverified controls.
4. For billing implementation, finalise employee counting, trial/renewal timing, VAT inclusion and EUR/RON conversion with the SAGA workflow, and payment grace policy. No employee-level payments or payroll details need to be sent to Stripe.
5. Verify production SMTP variables separately and perform an actual delivery only on explicit instruction with an agreed recipient. Successful TLS/authentication is not proof of inbox delivery. Follow the existing uncertain-attempt reconciliation rule.
6. Resolve live Supabase access/history checks when needed without blind reapplication or auth-config pushes. Actual REGES submission, broader payroll, signing and automated privacy operations remain future work.

---

## Historical state — earlier 23 September release checks (superseded)

**The user requested a safe checkpoint on 23 September 2026, then explicitly asked to continue. The remaining local release checks and documentation are now complete. This section supersedes all historical resume instructions below.**

- **Never run `npm run dev`, start another preview server, or stop the user's server.** The user manages it in VS Code and prefers to perform manual screen checks themselves. No server was started or stopped this turn.
- Preserve the working tree, including untracked source files. The starting commit was **`1312319` (`pdf generation`)**; the earlier documents/lifecycle implementation was committed by the user. Only their checkpoint edit was dirty initially. Current additions are local and uncommitted. No commit, push, deployment, production HR mutation or actual email send occurred this turn.
- Supabase project is still `mlgnmdhfhybhzzcoxmtr`. The user reports applying **007 manually**; its remote schema/history have **not been verified**. Latest CLI migration listing returned HTTP **403 access denied**. This does not prove logout; do not keep requesting login. Do not blindly reapply 007 or repair migration history without checking the live schema/history first.
- New migrations **008 optional MFA, 009 REGES preparation, 010 document email are local only**. Do not deploy the new frontend before applying and verifying its database dependencies. Root Supabase config contains local auth URLs; do not push it to production.
- **MXroute setup is pending by the user's explicit choice.** Local variables passed format validation, but a TLS/authentication-only check failed with `EAUTH`. No email was sent and no credential/provider response was logged. The user then chose **“Leave email setup pending”**. Do not retry, send a test email or ask for passwords on resume without a new instruction.
- **SMTP credential rotation needed:** a subsequent release-file read found an SMTP password in tracked `.env.example` and included it in diagnostic output. The password/server values were immediately cleared from that template, and the user was told to rotate the mailbox password before resuming email setup. The committed HEAD template contained no SMTP password; no commit/push was made. `.env.local` remains Git-ignored and was not printed. Do not copy the exposed value into any file or message; keep replacements only in private local/deployment settings. Rotation has not been confirmed.

### Confirmed product decisions

- Product name HRConnector; preserve deployment-level white-label configuration.
- Salary documents mean **payslips with deductions**. User explicitly requested **automatic tax calculations** and chose **an in-app payroll calculator**, superseding the earlier manual-accountant-input/provider-only proposals.
- **MFA optional for everyone first**, including Superadmins and owners. Once a user enrolls, a password-only session must not access their protected data.
- Email provider **MXroute**, sender **`admin@mkdir.space`**. Secrets belong only in `.env.local`/Vercel, never chat/Git. Local configuration is present but authentication is unresolved; Vercel SMTP configuration is not verified.
- Public Romanian SEO page with **no navigation or footer link to it**. It should link out to `https://www.mkdir.space`, describe real capabilities and mention HR management, employees/contracts/attendance and REGES preparation. Public crawlability is intentional; Google indexing/ranking is not guaranteed.
- Prepare REGES integration using the official employer guide; do not claim a working government connection.
- Subscription advice requested for **€2/employee/month**. Earlier preferences: Stripe, 30-day trial, employee added during September first billed in October. No live billing integration or charges authorised by this proposal.

### Implemented locally in this turn

1. **Optional TOTP MFA**: `/account/security`, enrollment QR/manual secret, verification, factor removal, unfinished-factor cleanup, RO/EN UI, security links. `requireSession` is restricted to account-security access; `requireUser` requires AAL2 after verified enrollment. Migration 008 adds `private.session_meets_mfa()`, gates `role_in`, platform access, own-membership reads and organisation creation. Local tests cover password-only denial of tenant data, RPCs, platform access and private files, AAL2 restoration and unverified factors. No password-only recovery bypass or app recovery codes. Real Supabase enrollment/challenge/removal screens remain untested.
2. **REGES preparation**: `/integrations/reges`, owner-managed employer/author UUIDs, HR read-only visibility, tenant/MFA/version enforcement in migration 009. No tokens collected. `src/lib/reges.ts` reports the adapter unavailable and rejects submission. `docs/reges-integration.md` records schema/mapping, encryption, official test access, ordered queue and asynchronous result work still required.
3. **Automatic standard payroll**: `/payroll`, preview and private payslip generation using `src/lib/payroll.ts`, `payroll-i18n.ts` and document Storage flow. Rule version `RO-2026-standard-v1`: 2026 only, full-time/full-month normal-condition Romanian tax residents, whole-RON basic salary and taxable cash bonuses. CAS/CASS/income tax, basic/young/child deductions and conditional 300/200 RON allowance; 4,050/4,325 minimum split at July. Employer CAM/cost explicitly indicative, not aggregate tax-return amounts. Detailed sources and exclusions in `docs/payroll-rules.md`.
   - The user wanted a calculator; this is the first bounded implementation, **not a complete Romanian payroll engine**. Part-time, partial months, leave adjustments, benefits/vouchers, special exemptions, foreign cases, other deductions, garnishments/advances, D112 and bank payments remain unsupported.
   - Server generation rechecks active employee, exactly one overlapping active full-month RON contract, 8 hours, matching basic salary; approved leave, recorded absence or active benefits block this standard-case PDF. Historical contract changes are not reconstructed. Eligibility declarations/counts are supplied by HR, not inferred from birth dates or dependants' identities.
   - PDFs contain period, input facts, tax breakdown and rule version, start HR-only, and require review before payment. Regeneration creates another document; no structured payroll-run ledger/correction workflow yet. Rounding and supported cases require accountant reference examples before production reliance.
4. **MXroute document delivery**: Nodemailer and its types installed; `.env.example` contains SMTP variable names. Server-only TLS with certificate verification on 465/587, safe generic errors, individual PDF attachments, explicit HR recipient confirmation. Only ready employee-visible nonarchived documents can be sent to the current employee email. No automatic sends or payroll payment execution.
   - Migration 010 stores delivery attempts and audit metadata. Pending/accepted/uncertain attempts block another send; a definitely failed attempt can be retried. Only the original requester/current HR can finish an attempt. SMTP acceptance does not prove inbox delivery. Pending/uncertain outcomes need operator reconciliation against provider logs; no reconciliation UI yet.
   - `scripts/verify-smtp.mjs` validates format and calls transport.verify() only, with sanitized output. Run when the user wants to resume setup: `node --env-file=.env.local --experimental-strip-types scripts/verify-smtp.mjs`. Never print environment secrets.
5. **Public discovery page**: `/hr-management-romania`, local CSS, canonical/OpenGraph/SoftwareApplication structured data, indexable override, sitemap and robots files. Proxy skips auth refresh for these public routes. No sidebar/footer link to this page. All outbound product links point to `https://www.mkdir.space`. Final copy explains the bounded calculator and its unsupported cases; no live REGES or full-payroll claims.
6. **Data protection**: `/settings/data-protection`, settings links and `docs/data-protection.md` document implemented access/private-file/MFA/audit controls plus remaining organisational/legal requirements. This is **not GDPR certification**. Operator identity, privacy notices, DPAs/transfers, retention/erasure/export procedures, incident response and backup/restore verification still need work. Archive retains records indefinitely; PDF parsing is not malware scanning.
7. **Billing advice**: `docs/billing-proposal.md` recommends one company subscription/invoice, €2 multiplied by the monthly billable employee snapshot, hosted Checkout and customer portal, no mid-month proration. Trial alignment, active/leaver counting, VAT/currency, minimum invoice and failed-payment grace policy need decisions before implementation. No Stripe code, customer creation or charges.
8. **Phase 5 integration**: employee-profile document/lifecycle links, sidebar routes, audit action labels, dashboard roadmap copy and shared styling. Existing lifecycle detail was formatted; an activity view is still optional follow-up. See the historical Phase 5 section for its underlying document/checklist/access-revocation controls.
9. **Release documentation and live-check preparation**: README, architecture and roadmap now describe the implemented scope and limits. Broken privacy links replaced with EDPB guides. All touched/new source formatted. Added `tests/live-documents-smoke.sql`: synthetic transaction-only metadata/lifecycle/REGES checks, pending-document email rejection, cross-tenant isolation, scoped access removal and closure audit. It creates no fake Storage objects, sends no emails and rolls back all fixtures.

### Verification completed before stopping

- Full **52-test suite passed** after adding the three migrations and MFA/REGES regression checks, before the last tests were added.
- Focused run **20/20 passed**: 11 document/lifecycle/MFA/REGES/email database tests, 5 payroll/mail-configuration tests and 4 PDF tests. After adding the live smoke script, **all 12 document tests passed**, including assertions that its synthetic users/organisations/documents/checklists/audit records roll back. There are now 60 tests; do not describe all 60 as a single final suite run. Existing unrelated tests were not repeated needlessly.
- **Final TypeScript, ESLint and production build passed.** Build generated all new routes. Payroll's output trace includes and resolves the Noto Sans font (duplicate trace entries are harmless; check presence after deduplication). Built robots/sitemap output was inspected and lists only the public product page. `git diff --check` passed with normal LF/CRLF warnings only. Next regenerated `next-env.d.ts` for production route types; do not treat that as hand-authored feature code.
- PDFs executed with synthetic Romanian data: one-page employee summary, two-page long HR letter (including long-word wrapping), and **one-page payslip using the same body builder as the app**. All four rendered pages inspected; Romanian glyphs, margins, wrapping and footers are clean. Invalid/encrypted inputs and unsupported glyphs rejected in tests.
- PDF skill was announced/read. Its authoring marker **already ran successfully exactly once**; do not run it again in this conversation. Synthetic `tmp/pdfs` intermediates are removed at checkpoint cleanup. Regenerate through `HR_PDF_QA_DIR` if later rendering changes justify it.
- Node package installation reported zero vulnerabilities. MXroute verify-only check returned EAUTH, and setup is explicitly left pending.
- **Not done**: live 007 schema/history verification; 008–010 application/live lint; execution of the new smoke script against Supabase; actual Storage transfers; real MFA Auth flow; email sending/inbox delivery; authenticated/manual new-screen checks. A final authorised CLI migration-list retry still returned the same 403, so no remote migration was attempted. Local PGlite tests model PostgreSQL and Storage metadata, not actual Storage/SMTP/Auth services.

### Resume in this order

1. Read this section and Git status; preserve all local/untracked work. Do not start or stop the user's server, ask for a password, retry SMTP, or change real Cozumel SRL data as a test.
2. Resolve the actual Supabase 403 access issue when possible. First list migrations and inspect whether manually applied 007 matches local schema/history. Apply only genuinely pending migrations, then `npx supabase db lint --linked --level warning` and `npx supabase db query --linked --file tests/live-documents-smoke.sql`. Do not blindly repair migration history or push the localhost auth configuration. The new frontend depends on 008–010; do not deploy it before the database is ready.
3. Complete real Storage/Auth and manual screens after migrations. Use a disposable test company/account for PDF upload, generation, visibility, download and MFA enrollment/challenge/removal. The user runs the dev server and prefers checking screens themselves. **Never insert fake live Storage objects with SQL** or revoke the real owner's access. The rollback smoke already passes locally.
4. Review payroll against independent accountant examples, especially tax/deduction rounding, eligibility, month boundaries and unsupported cases. Add tests only for uncovered consequential behavior. Expand supported payroll cases as separate versioned rules; do not claim the entire original payroll requirement is complete.
5. Leave SMTP pending until the user resumes it and rotates the exposed mailbox credential. Recheck TLS/authentication without sending, then verify an explicit recipient/delivery only when authorised. No automatic retries or real employee emails as a test.
6. Local build/font tracing, lint/types and focused tests already pass; do not repeat them unless changes justify it. No commit/push/deploy has been requested. Update this checkpoint with exact live outcomes when available.
7. Remaining product work includes expanded payroll cases, actual REGES submission, organisational privacy/retention workflows and Stripe integration. Consider checklist activity display later. Treat the billing document as advice, not an approved charge configuration.

---

## Historical checkpoint — 21 September 2026 (superseded)

## Current: Phase 5 in progress — stopped at the user's request

**21 September 2026: the user requested a safe checkpoint because usage is running out. Stop work here until they ask to resume.**

- **Do not run `npm run dev`, start another preview server, or stop the user's server.** The user starts it in VS Code and performs the manual screen checks. No development server was started in this phase.
- User approved continuing to documents/lifecycle and explicitly requested **document generation now**. Proposed defaults retained: PDF uploads up to 10 MB, HR-only or employee-visible files, archiving without permanent deletion, onboarding/offboarding checklists. Electronic signing is later. Generation currently implements an employee summary and an HR-written letter populated with employee/company details; these are not employment contracts or statutory templates.
- Work started from clean commit **`9fb0891` (`benefits 2`)**. All Phase 5 changes are local and uncommitted, including new files. No commit, push, deployment or live HR-data mutation was made. Preserve the entire working tree on resume.
- **Migration `202609210007_documents_lifecycle.sql` is local only and has been applied manually.** Remote migrations 001–006 remain applied. The new navigation/routes require migration 007; do not deploy this partial phase or treat the new screens as ready yet.
- Supabase project remains `mlgnmdhfhybhzzcoxmtr`. Initial CLI migration listing returned HTTP 403. The user ran `npx supabase login` again and replied ready. The subsequent migration listing succeeded, confirming 001–006 aligned and only 007 pending. The user is frustrated by recurring login requests: a 403 means access denied, not proof of logout; no login/logout changes were made by the agent. Avoid another login request without checking an actual failure first.

### Implemented locally

- Migration 007: `employee_documents`, `lifecycle_cases`, `lifecycle_tasks`; tenant-scoped keys, RLS, checked security-definer RPCs, version checks, active-company write checks and audit records. No Superadmin HR bypass. HR/owners see tenant documents/checklists; employees and managers only see their own ready employee-visible, nonarchived documents. Assigned managers do not gain document or checklist access.
- Private bucket configuration for `hrconnector-employee-documents`, PDF MIME and 10 MB limit. Storage object INSERT requires the exact pending document path, its uploader and active HR membership. SELECT follows document permissions. Restrictive policies prevent broad policies for other buckets from allowing unauthorized read/upload or overwrite/move/delete of these files. Binary file operations use the Storage API, never SQL.
- Document flow: server action prepares metadata, browser uploads directly to Storage using its existing authenticated session, server downloads/validates the PDF before finalization. Uploaded/generated/signed/archived states plus internal pending state. Failed uploads remain visible to HR for retry-finalization or archival. Generation uploads through the authenticated server client. Downloads use browser-to-Storage JWT access and Blob download, avoiding app-server response-size limits. The app creates no public or signed download URLs.
- Signed state is an explicit HR attestation of an externally signed document, not electronic signing/verification. UI instructs uploading a signed copy as a new file if its contents differ. `document-signatures.ts` is an unavailable provider boundary that rejects requests.
- `/documents`, `/lifecycle`, `/lifecycle/[id]`, RO/EN dictionaries, forms, sidebar links, scoped employee picker, pagination, direct authenticated downloads, archive/visibility/signing controls. Sidebar lifecycle link is HR-only. No employee-profile links or new audit labels/dashboard roadmap changes yet.
- Checklist templates: onboarding profile/contract/REGES/benefits/payroll/documents/account; offboarding termination/REGES/benefits/payroll/documents/equipment/access. Up to 100 tasks including custom tasks. Task notes and skip/cancel reasons, optimistic versions, closed history, completion requires no remaining to-do tasks. Checklist confirmations do not perform REGES, contract, benefits or payroll operations.
- Owner-only offboarding access RPC removes only this organisation's membership and clears employee-account/manager links. Protects self-revocation and final owner, checks expected linked account and stale versions, records audit, preserves auth account and other-company memberships. The access task cannot be manually completed/skipped by the generic task RPC. Closing an offboarding case rechecks for regranted access; no-account confirmation rejects a matching existing company membership and directs the owner to link it first.
- `pdf-lib` and `@pdf-lib/fontkit` installed; install reported zero vulnerabilities. Local Noto Sans Regular TTF and OFL license in `assets/fonts/` for Romanian characters, with tracing configuration in `next.config.ts`. Font is loaded locally, not fetched during generation. `document-pdf.ts` contains A4 wrapping/pagination/footer rendering and PDF parsing validation. It has **not yet been executed or visually verified**.

### Verification at stop

- All **39 existing tests passed** with migration 007 and the new PGlite Storage metadata fixture.
- All **8 new documents/lifecycle tests passed**: visibility/own-record access, storage guards under broad policies, cross-tenant/role rejection, partial uploads, stale versions, suspended/blocked organisations, checklist history/closure, scoped access removal/regrant/self protections, input validation and unavailable signing.
- Final `npm run typecheck` **passed** after fixing the lifecycle status filter type. `git diff --check` passed (only normal LF/CRLF warnings).
- ESLint passed before the final new test file and small status-type fix; do not claim final lint/build checks complete. **No production build, live Phase 5 smoke test, Storage API transfer test, generated-PDF test/render, or authenticated screen check has been performed.** PGlite models Storage metadata/RLS only, not actual Supabase transfers.
- No need to rerun the 39 old tests unchanged. Run focused tests after relevant fixes; do final lint/build once the phase is finished. Never stop the user's server for a build without their instruction.

### Resume steps

1. Read Git status and this section; preserve edits. Review Phase 5 code for remaining correctness issues before applying migration. The new files are compact/unformatted; format only the touched/new files once settled.
2. Execute and visually verify PDFs with synthetic data, Romanian diacritics, long text and multipage letters; add focused generator checks for real PDF output and invalid/encrypted inputs. The PDF skill was announced/read at `C:/Users/cozum/.codex/plugins/cache/openai-primary-runtime/pdf/26.905.11957/skills/pdf/SKILL.md`. Its authoring marker **has not yet been run** and no PDF has been generated: run its `container_tools/mark_artifact_operation_started.mjs` successfully once immediately before the first PDF authoring command. Runtime Poppler is `C:/Users/cozum/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe`; bundled Python is `C:/Users/cozum/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Render and inspect representative/all sample pages. Use synthetic data, no real HR records.
3. Finish integration: employee-profile links (documents for HR/own employee, lifecycle for HR), audit labels, dashboard roadmap copy, README/architecture/roadmap instructions and explicit retention/access-revocation limits. Consider a checklist activity view so actor/audit information is accessible. No automatic file purge or legal retention period is configured. No digital-signature claims.
4. Add a live rollback SQL smoke test for new RPCs/tenant boundaries/lifecycle. Do not write fake live `storage.objects` rows: real files must go through Storage API. Storage API integration must be tested separately or clearly handed to the user's manual checks. Do not modify real Cozumel SRL records or revoke its owner's membership as tests.
5. Once local checks pass, check CLI access and apply **only pending 007**, then lint and run rollback smoke. `npx supabase db push --linked --yes`; `npx supabase db lint --linked --level warning`; `npx supabase db query --linked --file <smoke.sql>`. The old 006 lint recheck was blocked previously; a successful full remote lint now would close that issue too. Do not push root Supabase localhost auth configuration to production.
6. Run final appropriate lint/build checks, inspect font tracing in the build, update this checkpoint with exact results and hand manual screen checks to the user. The user starts `npm run dev` themselves. No commit/push/deploy requested.

## Previous checkpoint: Phase 4 benefits

The user requested the next phase and confirmed: **recorded worked days for per-day benefits, manual HR review of partial months, fixed monthly amounts without automatic proration, and manual annual/flexible allocations**.

- Implemented `/benefits`, `/benefits/settings` and `/benefits/monthly`. Added sidebar and permitted employee-profile links, Romanian/English forms/messages, audit labels and updated dashboard roadmap text.
- Catalogue supports custom providers and Pluxee/Edenred/Up România adapter identifiers. Providers, rates and enrolments are configured by HR; no sample or statutory amounts are seeded. Adapter implementations explicitly report unavailable and reject submission. No provider network calls, credentials, orders or payments.
- Five benefit models: fixed monthly, per recorded worked day, annual allowance, monthly flexible budget and non-financial. RON amounts only. HR maintains one dated enrolment per employee/benefit; the calculation model is immutable after creation.
- Monthly preparation uses recorded hours greater than zero for worked days, and snapshots employee/provider/benefit names, rates, suggested/final amounts, flags and a deduplicated whole-month worked-day count. Fixed amounts are not automatically prorated. Annual/flexible amounts start at zero for HR allocation. Defaults require an active employee, an overlapping active contract and active configuration.
- Exceptions cover partial months, missing attendance, no worked days, full-month absence, current employee/contract states, disabled configuration, annual/flexible allocation and an open month. Every flagged row must be reviewed, with a reason. HR can adjust or exclude a row. No statutory eligibility or historical employment-state reconstruction is claimed.
- Approval checks source changes and versions, serializes through the organisation row lock, and freezes the month. Another month's annual approval can invalidate an existing draft; annual limits and flexible monthly limits are enforced. Preparing again replaces draft adjustments. **Approved months cannot be reopened/corrected in this version**, explicitly stated in the approval UI.
- HR/owners manage all tenant benefits; linked employees/managers can read only their own enrolments, definitions and approved records. Managers do not gain assigned-staff benefit amounts. Superadmin does not bypass HR policies. RLS, cross-tenant keys, private helper grants, suspension/blocking and audit are covered by tests. Review notes become available to the linked employee after approval; do not enter medical details.
- Added migration `202609210005_benefits.sql` and applied it successfully to `mlgnmdhfhybhzzcoxmtr`. Live `tests/live-benefits-smoke.sql` passed and rolled back its users, tenants, contracts, attendance, benefits and audit fixtures. Real HR records were not changed.
- Schema lint reported one warning about implicit JSON initialization in `private.benefit_sources`. Added/applied `202609210006_benefits_jsonb_initialization.sql` to make the cast explicit, keeping the applied migration history intact. All 10 benefits tests, including the rollback smoke script and approved worked-day snapshot, pass against both migrations. The remote lint recheck returned the recurring CLI HTTP 403 after the successful push; no schema error was reported, but the final remote lint result is not yet available.
- Validation: all 29 existing tests passed with the benefits schema, all 10 new benefits tests pass against both final migrations, ESLint and production build passed. Final TypeScript and `git diff --check` passed too. The final remote schema-lint recheck returned 403 twice; reconnect before retrying. Do not repeat broad checks without a relevant change. README, architecture and roadmap describe setup, calculation rules and limits.
- Git started clean at `b26fea9` (`leave requests ...`), so the prior leave/attendance work was committed by the user. Benefits source changes are local and uncommitted; no commit, push or Vercel deployment was made. Do not claim the benefits frontend is live in production.
- The user previously chose to check screens themselves. Preserve that preference: no new password/sign-in request or agent-created real HR test records. Manual benefits screen verification is handed to the user.
- **User instruction: do not run `npm run dev`.** The agent stopped its development server (session `33893`) after this request. The user controls starting the local server. Do not restart it on resume. The benefits preview URL is `http://localhost:3000/benefits`; opening it requires the user's server to be running. Next.js may have regenerated `next-env.d.ts` to use `.next/dev/types`; this is generated tooling state.

### Resume from here

1. Preserve current Git changes and any manual screen-check results from the user. Both benefits migrations are already applied; do not apply them again or reset the database.
2. If needed, reconnect the Supabase CLI with the owning account and run `npx supabase db lint --linked --level warning` to finish the final lint recheck. The live workflow smoke test already passed; it need not be repeated for the explicit JSON cast alone.
3. The user manages the local server and manual screen checks; **do not run `npm run dev`**. Configure providers/rates, enrol an employee and prepare a month; review every exception before locking it with approval.
4. The owner can commit/push for Vercel deployment when satisfied. Benefits has no live provider integration or export, and no approved-month correction workflow.
5. Documents and lifecycle checklists are next in the roadmap. Stripe/trials remain separate requirements. Wait for the user's direction before starting another phase.

## Previous checkpoint: Phase 3 leave and attendance

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
