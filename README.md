# HRConnector

A white-label HR workspace for Romanian companies. Next.js App Router, strict TypeScript, Tailwind CSS, and Supabase Auth/PostgreSQL. Romanian is the default interface language; English is available from the language switch.

## Implemented scope

- Email/password signup, confirmation, sign-in, sign-out, and password recovery.
- Organisation creation in one database transaction; organisation switching and settings.
- Owner, HR manager, manager, and employee access enforced in server actions and PostgreSQL RLS.
- A separately provisioned Superadmin area with searchable, paginated organisation accordions, onboarding details, creation with a confirmed owner, and audited suspension/blocking/restoration. It never bypasses tenant HR policies.
- Dashboard with live counts, departments, recent employees, and audit activity.
- Employee directory with search, filters and pagination; creation, editing, profiles, and manager assignment.
- Contract creation/editing, statuses, fixed/indefinite terms, salary storage, and the database relationship for future addenda.
- Owner-managed access for existing confirmed accounts, including linking a user to an employee record.
- Full-day leave requests, manager/HR approvals, calendar/list views, yearly allowances and configurable leave types/work calendar.
- Daily planned/worked hours and absence records, monthly attendance totals and automatic approved-leave integration.
- Effective-dated organisation/employee weekday schedules, inherited defaults, historical protection and leave-conflict checks.
- Benefit providers/catalogue, employee enrolment, five calculation models and monthly HR review/approval with saved amounts.
- Private PDF uploads/generation, employee visibility, archival, onboarding/offboarding checklists and owner-controlled company access revocation.
- Optional authenticator-app MFA for every role, with database and Storage enforcement once enrolled.
- Automatic supported-case 2026 payroll calculation, including part-time contribution floors, declared meal vouchers and paid salary advances, with printable individual payslips; explicit HR-controlled email delivery through MXroute.
- REGES identifier preparation, data-protection guidance and a public Romanian product-discovery page.
- Automatic audit events for organisation, membership, employee, contract, salary, leave, attendance, benefits, documents and lifecycle changes.

Live REGES/provider submissions, electronic signing, full payroll case coverage and Stripe billing remain future work. No integration success or production data is simulated. See `docs/checkpoint.md` for actual migration/deployment verification status.

## Local development

Requires Node.js 22.18+ (for the TypeScript test runner; Node 24 LTS is recommended) and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Set these values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_BRAND_NAME=HRConnector
```

The app uses only the publishable key with the signed-in user's JWT. It does not require a service-role key. `.env.local` is ignored by Git.

```powershell
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push --linked
npx supabase config diff
# The root Supabase configuration is for local development.
# Do not push its localhost Site URL to the production project.
npm run dev
```

Open http://localhost:3000. Local 127.0.0.1 requests redirect to the configured localhost origin to keep confirmation cookies consistent. Without Supabase environment settings the app shows a setup screen.

Alternatively, run `npx supabase start` with Docker for a fully local backend. Apply migrations with `npx supabase db reset` **only to the disposable local database**. Use its URL/key from `npx supabase status`; local confirmation emails appear in the local SMTP inbox at http://localhost:54324.

## First account and access

1. Register through `/register`, confirm the email, and sign in.
2. Create the organisation. The creating account becomes its owner atomically.
3. Add an active/onboarding employee from the directory. HRConnector starts an onboarding checklist and attempts an MXroute invitation automatically. Its status and resend/revoke controls appear in the compact employee-profile checklist. Add a contract from the Contract tab.
4. Colleagues register and confirm their own accounts. An owner can grant access by email under **Echipă și acces**, choose the role, and link the employee record. Re-entering an existing member's email updates their role. No invitation emails are sent by this flow.
5. A manager sees only employees assigned to their account. A linked employee sees only their own profile/contracts. Owners and HR manage all HR records inside their organisation. A member's role in one organisation never applies to another.

The final owner cannot be demoted, including under concurrent requests. Membership writes are available only through authorised database functions; the frontend cannot promote itself or change employee account links directly. An owner can revoke this company's access through an offboarding checklist; this preserves the auth account and other-company memberships. Global account deletion is not included.

Apply migration **011** for employee invitations. The employee follows `/join`, registers/signs in with the invited email, confirms it and accepts **employee-only** access. Acceptance is single-use, expires after seven days, respects MFA and company status, and cannot overwrite an existing elevated role or bypass active offboarding. UUID links are references, not bearer authentication. HR can replace/revoke invitations; changed email/account links or inactive employee status invalidate pending invitations. Existing employees are not mass-emailed by the migration. Direct API inserts queue invitations but only the app's creation action attempts delivery; interrupted/failed sends can be retried explicitly from the profile.

In Supabase Auth's redirect allowlist, add `https://www.mkdir.space/auth/confirm?next=/join` and the equivalent localhost URL for local tests. The separate production config contains these additions; **do not push the root localhost config to production**. Configure app SMTP and `NEXT_PUBLIC_SITE_URL` in Vercel before testing actual invitations. Supabase account-confirmation emails use Supabase's own email configuration.

To provision the platform owner, run the following **once from a trusted SQL/admin session**, substituting the verified owner's email. It cannot be called from the app's public key:

```sql
insert into private.platform_admins (user_id)
select id from auth.users
where lower(email) = lower('YOUR_CONFIRMED_EMAIL')
  and email_confirmed_at is not null
on conflict (user_id) do nothing;
```

Superadmins can open `/platform` without any organisation membership. After signing in, an administrator without memberships is routed there automatically. No public signup or editable user metadata can grant this role.

In Superadmin, expand an organisation row to edit its legal name, CUI, trade register number, registered address, city/county and business contact details. Creating an organisation requires an existing, email-confirmed owner account; the administrator is not automatically added as a tenant member. CUI uniqueness ignores the optional `RO` prefix. These fields prepare onboarding; they do not connect to REGES or validate government records.

Access states are independent of employee and contract statuses:

- **Active:** members can use their assigned roles normally.
- **Suspended:** members can read their permitted HR data; HR, organisation and membership changes are disabled.
- **Blocked:** HR data and read RPCs are unavailable. Members can still see their own membership/organisation metadata, switch organisations and sign out. Superadmin access remains available to provisioned administrators.

Every status transition requires a reason and UI confirmation; the reason is visible to members. Database policies and write guards enforce restrictions on direct API calls as well as the interface. Row locks serialize access changes with writes; version checks prevent stale Superadmin forms from overwriting newer organisation changes. Restoration retains all records. Organisation audit history records actors, changed field names, status transitions and reasons; the overview shows the latest 10 organisation events, never employee or salary history.

## Leave and attendance setup

1. Apply `202609200004_leave_attendance.sql` before deploying the new screens. It adds the time tables and seeds annual, medical and unpaid leave types for each organisation; it does not create employee records or allowances.
2. Under **Leave → Leave settings**, HR or an owner enters each employee's yearly allowance, including any agreed carryover. Approved and pending requests reserve days. No statutory entitlement or accrual is calculated automatically.
3. Configure holidays and company exceptions before requesting leave. The default working week is Monday–Friday; public holidays are not automatically imported. Requests use full working days within one year. Split periods that cross New Year.
4. Linked employees request their own leave; HR/owners can submit for employees. HR/owners or the assigned manager approve/reject, but cannot approve their own leave. A second approver is needed for an owner's own request. Employees can cancel their pending requests; HR/owners can also cancel approved requests. Rejection/cancellation requires a reason visible to the employee.
5. Apply migration **012**. In **Attendance**, completed working days before today (Europe/Bucharest) automatically count the daily hours of one applicable contract. Today/future days remain planned. HR/owners or the assigned manager can override each date; manual records are preserved. Approved leave supplies zero worked hours. Employees can read their own attendance. Configure public holidays/company calendar exceptions; they are not inferred.

Automatic days are labelled separately and calculated at read time, without a cron or key-card integration. Missing/overlapping contracts or inactive/suspended employment do not generate assumed work; planned hours retain the legacy eight-hour fallback if a unique contract is unavailable. Historical ended contracts count only with an explicit end date; the app does not reconstruct suspension/change history. Contract/calendar changes can change unoverridden automatic history. Record a manual correction when needed; approved benefit snapshots stay fixed.

Approved leave fills attendance automatically. Conflicting recorded work/absence or a zero-hour plan prevents approval; correct that day first. Approved leave must be cancelled before editing its attendance dates. Calendar changes affecting pending/approved leave require cancelling and resubmitting those requests. The calendar shows counts across all permitted requests, independent of list pagination.

Migration **013** adds **Attendance → Work schedules** for HR/owners. Choose organisation weekdays and employee overrides, effective today or later. Employee patterns can return to the organisation default; company date exceptions take precedence. See [schedule setup and release checks](docs/work-schedules.md).

There is no clock-in/out, rotating shift calendar, half-day leave or automatic accrual. The separate payroll calculator does not calculate leave pay and refuses non-Monday–Friday recurring schedules. Do not enter diagnoses or medical details in decision reasons. The same tenant isolation, suspension/blocking and Superadmin boundaries apply to both modules.

## Benefits setup and monthly preparation

1. Apply migrations `202609210005_benefits.sql` and `202609210006_benefits_jsonb_initialization.sql` before deploying this module. No providers, rates or employee enrolments are seeded.
2. In **Benefits → Benefits catalogue**, add a provider (Pluxee, Edenred, Up România or custom), then define benefits. All values are in RON. Supported models are fixed monthly, per worked day, annual allowance, monthly flexible budget and non-financial. The amount is a rate or limit, not a statutory or tax calculation. Non-financial amounts must be zero; the model is fixed after creation.
3. Select an employee in **Benefits** and add an enrolment with start/end dates. Each employee/benefit has one enrolment, which can be edited or disabled. Only HR/owners manage benefits. Employees and managers can read their own linked enrolments and approved records; managers do not see assigned staff's benefit amounts.
4. In **Monthly preparation**, choose a month and prepare a draft. Per-day amounts count manual and automatic worked days within the enrolment period, excluding approved leave. Automatic attendance is flagged for HR review before approval. Fixed monthly amounts stay at the configured amount; HR reviews any proration manually. Annual and flexible budgets start with zero allocation for HR to fill in.
5. Review every flagged row, set its final allocation or exclude it, and record a reason. Flags cover missing attendance, partial months, full-month absence, no worked days, inactive employee/enrolment/provider/benefit, missing or suspended/terminated contracts, manual allocations and a month that has not ended. The default inclusion rule requires an active employee, at least one overlapping active contract and active configuration. These are current recorded states, not reconstructed legal eligibility; HR decides exceptions.
6. Approve after review. Approval freezes the month's records and worked-day total, making approved items visible to the linked employee. It sends no order/payment/provider data. Approved months cannot be reopened/corrected in this version; the form explicitly warns before approval.

Preparation snapshots source data and compares it again before approval. Changes to attendance, relevant employment records, enrolments, configuration or annual spending require preparing again, which replaces draft adjustments. Optimistic versions also reject stale forms. Annual allocations across approved months cannot exceed the configured yearly limit; monthly flexible allocations cannot exceed their limit. Draft annual allocations do not reserve budget, but serialised approval and source checks prevent conflicting drafts from overspending. Monetary values are not duplicated in audit metadata. Review reasons are available to the employee after approval and must not contain medical details.

`src/lib/benefit-providers.ts` defines the future provider adapter boundary. All adapters report disconnected/not implemented and reject submission; there are no credentials or network calls. Provider APIs, exports, statutory tax treatment, automated proration and changes to approved months are deferred.

## Documents, checklists and payslips

Apply migration 007 before using `/documents` and `/lifecycle`. Upload PDFs up to 10 MB to the private bucket using the authenticated Storage API; files are parsed before finalisation. HR chooses HR-only or employee-visible access. Linked employees/managers can read only their own ready employee-visible files, not assigned staff's documents. Downloads use the user's JWT, without public/signed URLs. Archive preserves the binary and history; there is no automatic retention purge or malware scanning.

Generate an employee summary, an HR-authored letter or a payroll payslip. Local Noto Sans supports Romanian diacritics and is traced into the deployment. A signed status records HR's attestation of an external signature; the application does not create or verify electronic signatures. Upload a new file for a different signed copy.

Checklists record completed/skipped tasks and preserve closed history. Only an owner can execute the offboarding access step. It removes this organisation's membership/account links and manager assignments, protects self/final-owner access and detects access regranted before closure. It does not delete the login account, erase retained records or change contracts/benefits/REGES automatically. Previously downloaded or emailed documents cannot be recalled.

`/payroll` automatically computes supported full-month Romanian 2026 salary deductions and net cash pay, then saves an HR-only PDF. Part-time employer contribution top-ups and evidenced floor exceptions, declared meal vouchers and already-paid advances are included. HR reviews benefit issuance and deduction eligibility; the server matches the contract salary/hours. Review [the exact supported cases and sources](docs/payroll-rules.md) before use. Fractional-leu amounts, partial months, leave adjustments, other benefits, income-tax exemptions and other deductions need separate handling. This is not a full payroll engine, D112 filing or bank-payment facility. Have an accountant validate representative outputs before payments.

## Optional MFA and document email

Apply migration 008 before enabling MFA. Every user can enroll an authenticator at `/account/security`. Once enrolled, AAL2 is required for protected app routes, direct data RPCs and private Storage. Add a second authenticator before replacing a device. There is no password-only disable/recovery bypass; lost-factor recovery needs the operator's verified support procedure.

Apply migration 010 for document delivery. Set `SMTP_HOST` to the actual MXroute server, `SMTP_PORT=465` (or 587 with required STARTTLS), `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM=admin@mkdir.space` in private local/deployment settings. Quote passwords containing `#` in dotenv files. No `NEXT_PUBLIC_` SMTP secrets. Supabase authentication-email SMTP is configured separately in Supabase.

To verify connection/TLS/authentication without sending mail:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/verify-smtp.mjs
```

After HR reviews a document and makes it employee-visible, its action menu allows explicit delivery to that employee's current email. The recipient must be confirmed; a PDF attachment is a permanent external copy. Accepted/pending/uncertain attempts block resending. Definite failures can be retried; uncertain results require checking provider logs first. SMTP acceptance is not proof of inbox delivery. Local MXroute connection, TLS and authentication passed a verify-only check on 23 September 2026; no real message has been sent, and Vercel SMTP settings/delivery remain unverified.

## REGES, data protection and discovery

Apply migration 009 for `/integrations/reges`. Owners can save official employer/author identifiers and HR can read them. This is preparation only: no access tokens, test/production connection or submission is implemented. [The integration plan](docs/reges-integration.md) covers the remaining credential, schema, queue and result work.

Migration 012 adds HR review on each employee's Contract tab. Each contract edit invalidates the previous review. Approval records the current revision, reviewer and time; it does not transmit anything. A future submission queue must enforce current review atomically and include review of all other mapped payload data.

Logged-out visitors see a public homepage with discreet **€2/employee/month** pricing. Applicable taxes are left to the offer until the VAT/currency rules are agreed. Signed-in users continue to the dashboard. The separate `/hr-management-romania` discovery page still has no navigation/footer links pointing to it.

`/settings/data-protection` and [the operational assessment](docs/data-protection.md) explain implemented controls and responsibilities. The [Cozumel SRL provider handbook](docs/privacy/provider-handbook.md), draft customer DPA, vendor register and operational register templates cover rights, incidents, support access and service exit. Contracts, notices, retention decisions and recovery evidence still need completion and adoption. Technical controls or draft procedures alone do not establish GDPR compliance.

`/hr-management-romania` is a public Romanian product page, intentionally absent from navigation/footer links. It links to the product origin and appears in `sitemap.xml`; private workspace routes retain authentication and noindex. Discovery/indexing/ranking, including Google AI, is not guaranteed. Submit the sitemap in Search Console after deployment. [The billing proposal](docs/billing-proposal.md) recommends one company subscription at €2 per billable employee per month; Stripe is not connected.

## Auth email configuration

In Supabase Authentication → URL Configuration, use the exact application origin as the Site URL. Allow:

- `http://localhost:3000/auth/confirm`
- `http://localhost:3000/auth/confirm?next=/update-password`
- `http://localhost:3000/update-password`
- The equivalent paths under the production Vercel/custom domain.

The default Supabase confirmation email uses its verification URL, then redirects with a PKCE code. Confirm on the same browser where signup started. For confirmations across devices, the confirmation template can instead use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. The recovery template can use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password`. The callback accepts only known verification types and internal destinations.

Configure your own SMTP provider before inviting real users; the built-in email service has delivery and rate limits. Keep email confirmation enabled.

## White-label configuration

- `src/lib/brand.ts`: product name, monogram, and optional logo asset. The name can be overridden with `NEXT_PUBLIC_BRAND_NAME`.
- `src/app/globals.css`: shared `--brand`, `--brand-hover`, `--brand-soft`, surface, border, and typography tokens.
- `src/app/icon.svg`: favicon; replace alongside the product logo.
- `src/lib/i18n.ts`: Romanian and English UI dictionaries and display formatting.

Branding is deployment-wide in this MVP. Each tenant has its own organisation name. Per-tenant logo/theme/domain settings can be added later without changing HR records.

## Project structure

```text
src/app/(auth)/             Authentication screens
src/app/(workspace)/        Protected dashboard, employees, contracts, leave, attendance, benefits and settings
src/app/platform/           Membership-independent Superadmin pages and mutations
src/app/organisation-access/ Blocked-workspace explanation and organisation switching
src/app/actions.ts          Validated and authorised server mutations
src/app/auth/confirm/       Email confirmation and recovery callbacks
src/components/            Shared forms, shell and interface elements
src/lib/auth.ts             Request-scoped session and organisation checks
src/lib/supabase/           Server-side Supabase client and configuration
src/lib/validation.ts       Runtime input validation
src/lib/database.types.ts   Database TypeScript contract
src/lib/i18n.ts             Localised interface strings
supabase/migrations/       Versioned SQL schema, permissions, RLS and functions
tests/                     PostgreSQL isolation and input validation checks
docs/                      Architecture and phased roadmap
```

## Verification

```powershell
npm test
npm run lint
npm run build
npx supabase db lint --linked --level warning
npx supabase db query --linked --file tests/live-rls-smoke.sql
npx supabase db query --linked --file tests/live-platform-smoke.sql
npx supabase db query --linked --file tests/live-time-smoke.sql
npx supabase db query --linked --file tests/live-benefits-smoke.sql
npx supabase db query --linked --file tests/live-documents-smoke.sql
```

The test suite runs all migrations in an embedded PostgreSQL engine (PGlite) with Supabase auth/Storage fixtures. It checks tenant boundaries, roles, stale updates, access states, time/benefit workflows, private documents, lifecycle revocation, MFA, REGES identifiers and email reservations. Pure tests verify supported payroll cases and PDF validity/pagination. SQL smoke scripts use temporary records inside transactions and roll everything back, including auth users and audit rows. They do not exercise actual Storage transfers, Auth MFA providers or SMTP delivery; those need separate service/UI checks. See the checkpoint for which live checks have run.

## Vercel deployment

1. Create the GitHub repository and push this project.
2. Import it into Vercel using its Next.js preset.
3. Set the four environment variables above in Vercel. Use the production HTTPS origin for `NEXT_PUBLIC_SITE_URL`.
4. Apply pending database migrations using an authorised CLI session. Migrations are intentionally not run from the browser or automatically during the Vercel build.
5. Update Supabase's Site URL and allowed redirects for the production origin. Inspect `supabase config diff` before any later configuration push so local URLs never overwrite production settings.
6. Deploy, create a confirmed owner account, and verify sign-in, organisation creation, employee and contract flows.

GitHub and Vercel credentials are not stored in the source. Standard Next.js server rendering and server actions work directly on Vercel; no alternative hosting runtime is required.

The current production origin is `https://www.mkdir.space`. A separate production configuration declares only the hosted auth Site URL and allowed redirects, retaining localhost callbacks for development:

```powershell
npx supabase --workdir supabase/environments/production config diff --project-ref mlgnmdhfhybhzzcoxmtr
# Review the diff before applying; undeclared remote settings are preserved.
npx supabase --workdir supabase/environments/production config push --project-ref mlgnmdhfhybhzzcoxmtr
```

In Vercel, the application expects **`NEXT_PUBLIC_SITE_URL=https://www.mkdir.space`**, not `PUBLIC_SITE_URL`. Changing Vercel environment variables requires a new deployment. Supabase's production auth settings were applied and checked during the checkpoint review.

## References

- [Next.js server actions and forms](https://nextjs.org/docs/app/guides/forms)
- [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
