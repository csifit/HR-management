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
- Benefit providers/catalogue, employee enrolment, five calculation models and monthly HR review/approval with saved amounts.
- Automatic audit events for organisation, membership, employee, contract, salary, leave and attendance changes.

Documents, REGES, onboarding checklists, and external provider integrations are later phases. Navigation labels identify planned modules. There is no payroll calculation, provider submission, simulated integration success, or production demo dataset.

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
3. Add an employee from the directory. Add a contract from that employee's Contract tab.
4. Colleagues register and confirm their own accounts. An owner can grant access by email under **Echipă și acces**, choose the role, and link the employee record. Re-entering an existing member's email updates their role. No invitation emails are sent by this flow.
5. A manager sees only employees assigned to their account. A linked employee sees only their own profile/contracts. Owners and HR manage all HR records inside their organisation. A member's role in one organisation never applies to another.

The final owner cannot be demoted, including under concurrent requests. Membership writes are available only through the authorised database function; the frontend cannot promote itself or change employee account links directly. Account removal and invitations are not part of this initial release.

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
5. In **Attendance**, select an employee and month. HR/owners or the assigned manager enter daily planned/worked hours or a full-day absence. Working dates default to 8 planned hours, editable per date. Unrecorded days are not assumed worked. Employees can read their own records.

Approved leave fills attendance automatically. Conflicting recorded work/absence or a zero-hour plan prevents approval; correct that day first. Approved leave must be cancelled before editing its attendance dates. Calendar changes affecting pending/approved leave require cancelling and resubmitting those requests. The calendar shows counts across all permitted requests, independent of list pagination.

There is no clock-in/out, per-employee recurring schedule, half-day leave, automatic accrual, payroll engine or medical-document storage in this version. Do not enter diagnoses or medical details in decision reasons. The same tenant isolation, suspension/blocking and Superadmin boundaries apply to both modules.

## Benefits setup and monthly preparation

1. Apply migrations `202609210005_benefits.sql` and `202609210006_benefits_jsonb_initialization.sql` before deploying this module. No providers, rates or employee enrolments are seeded.
2. In **Benefits → Benefits catalogue**, add a provider (Pluxee, Edenred, Up România or custom), then define benefits. All values are in RON. Supported models are fixed monthly, per worked day, annual allowance, monthly flexible budget and non-financial. The amount is a rate or limit, not a statutory or tax calculation. Non-financial amounts must be zero; the model is fixed after creation.
3. Select an employee in **Benefits** and add an enrolment with start/end dates. Each employee/benefit has one enrolment, which can be edited or disabled. Only HR/owners manage benefits. Employees and managers can read their own linked enrolments and approved records; managers do not see assigned staff's benefit amounts.
4. In **Monthly preparation**, choose a month and prepare a draft. Per-day amounts count dates with recorded worked hours greater than zero within the enrolment period. Unrecorded days are never assumed worked. Fixed monthly amounts stay at the configured amount; HR reviews any proration manually. Annual and flexible budgets start with zero allocation for HR to fill in.
5. Review every flagged row, set its final allocation or exclude it, and record a reason. Flags cover missing attendance, partial months, full-month absence, no worked days, inactive employee/enrolment/provider/benefit, missing or suspended/terminated contracts, manual allocations and a month that has not ended. The default inclusion rule requires an active employee, at least one overlapping active contract and active configuration. These are current recorded states, not reconstructed legal eligibility; HR decides exceptions.
6. Approve after review. Approval freezes the month's records and worked-day total, making approved items visible to the linked employee. It sends no order/payment/provider data. Approved months cannot be reopened/corrected in this version; the form explicitly warns before approval.

Preparation snapshots source data and compares it again before approval. Changes to attendance, relevant employment records, enrolments, configuration or annual spending require preparing again, which replaces draft adjustments. Optimistic versions also reject stale forms. Annual allocations across approved months cannot exceed the configured yearly limit; monthly flexible allocations cannot exceed their limit. Draft annual allocations do not reserve budget, but serialised approval and source checks prevent conflicting drafts from overspending. Monetary values are not duplicated in audit metadata. Review reasons are available to the employee after approval and must not contain medical details.

`src/lib/benefit-providers.ts` defines the future provider adapter boundary. All adapters report disconnected/not implemented and reject submission; there are no credentials or network calls. Provider APIs, exports, statutory tax treatment, automated proration and changes to approved months are deferred.

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
```

The test suite runs all migrations in an embedded PostgreSQL engine (PGlite) with realistic Supabase auth roles. It checks cross-tenant reads/writes, foreign-key tenant constraints, salary access, self-promotion, account linking, immutable audit records, final-owner protection, platform boundaries, organisation access states, restoration and stale updates. Time-module checks cover balances, overlaps, working-day snapshots, approval rights, attendance conflicts, date validation and monthly totals. Benefits checks cover all five models, mandatory exception review, annual/flexible limits, changing source data, frozen approved records, employee visibility and unavailable provider adapters. All four live SQL smoke checks use temporary records inside transactions and roll everything back, including auth users and audit rows.

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
