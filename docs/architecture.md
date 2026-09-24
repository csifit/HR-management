# Architecture

One Next.js application and one Supabase PostgreSQL database. No microservices, queue infrastructure, ORM, or event bus.

## Data model

| Entity                                               | Ownership and purpose                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `organisations`                                      | Tenant identity, onboarding/contact details, access status/reason, version, creator, timestamps |
| `organisation_users`                                 | Composite organisation/user membership; role and account display details                        |
| `employees`                                          | Organisation-owned directory and employment basics; optional linked account and manager         |
| `employment_contracts`                               | Organisation and employee-owned contract details, salary, status, and optional parent contract  |
| `leave_types`                                        | Tenant-owned leave categories, allowance behavior and availability                              |
| `leave_balances`                                     | Per-employee/type/year allowance configured by HR                                               |
| `work_calendar_days`                                 | Tenant working/non-working exceptions to Monday–Friday                                          |
| `leave_requests`                                     | Full-day requests, counted-date snapshot, status, decision actor/reason and version             |
| `attendance`                                         | Per-employee/day planned/worked hours, absence category, last editor and version                |
| `benefit_providers`, `benefits`, `employee_benefits` | Tenant catalogue and dated employee enrolments                                                  |
| `benefit_runs`, `benefit_run_items`                  | Reviewed monthly benefit snapshots and approvals                                                |
| `employee_documents`                                 | Tenant/employee metadata and private Storage path; pending, ready and archived states           |
| `lifecycle_cases`, `lifecycle_tasks`                 | HR-only onboarding/offboarding history and scoped account revocation                            |
| `reges_connections`                                  | Official employer/author identifiers, version and editor; no credentials                        |
| `document_deliveries`                                | HR-only recipient, reservation and delivery outcome metadata                                    |
| `audit_log`                                          | Append-only organisation-owned action history written by trusted triggers/functions             |
| `private.platform_admins`                            | Operator-provisioned global platform identities, with no implicit HR access                     |

Employee and contract IDs are globally unique, but references include `organisation_id` so cross-tenant employee, manager, account, and parent-contract links cannot be stored. A parent contract must belong to the same employee as its addendum. Organisation IDs and audit authors cannot be changed by authenticated API callers.

Contracts hold salary separately from the employee directory. Managers therefore cannot retrieve salary by requesting extra directory columns. Structured employee fields do not collect CNP, birth date or home address. Private uploaded documents may contain sensitive information, so minimisation and retention procedures still matter. REGES identifiers are not credentials; no REGES token is collected.

## Request path

1. The Next.js proxy refreshes Supabase session cookies. It does not make authorisation decisions.
2. Server pages/actions call `requireUser()` which validates the session with `auth.getUser()` and requires AAL2 once a verified factor exists. Only the standalone account-security route uses `requireSession()` to allow an AAL1 user to complete MFA.
3. `requireOrganisation()` checks the selected cookie against live database memberships. The cookie is a preference, never authority.
4. Every query includes an organisation filter. Every write derives its organisation from the verified context, not user input.
5. PostgreSQL RLS and column grants independently enforce access for direct API requests too.

Supabase server clients are created per request and use the public publishable key and the user's JWT. There is no browser-exposed administrative key or application-side RLS bypass. Next's server actions provide same-origin mutation handling; action handlers still check auth and role on every call.

## Roles

| Role           | Employee directory                       | Contracts/salary                        | Organisation/access                              |
| -------------- | ---------------------------------------- | --------------------------------------- | ------------------------------------------------ |
| Owner          | All tenant employees; create/edit        | All tenant contracts; create/edit       | Edit organisation; grant/change membership roles |
| HR manager     | All tenant employees; create/edit        | All tenant contracts; create/edit       | Read memberships; no role grants                 |
| Manager        | Assigned employees and own linked record | Own linked employee's contracts only    | Own membership and organisation metadata         |
| Employee       | Own linked record                        | Own contracts/salary, read-only         | Own membership and organisation metadata         |
| Platform admin | Requires an active/readable tenant role  | Requires an active/readable tenant role | Cross-tenant onboarding and access management    |

`create_organisation` atomically creates the tenant, its owner, and an audit event. Membership changes lock the organisation row, require ownership, preserve the final owner, and only link accounts to employees inside the same tenant. SQL helper functions have fixed empty search paths and explicit execute grants. The `private` schema is excluded from the Data API.

## Platform administration and access states

`/platform` has a separate layout and checks `is_platform_admin` independently of organisation selection. Its RPCs verify operator-provisioned membership in `private.platform_admins` on every call. They expose company metadata, aggregate employee/account counts, owner emails and organisation-only audit events. They do not expose employee records, contract salaries or general tenant audit data.

`platform_save_organisation` accepts a whitelist of company fields. Creation also assigns an existing confirmed account as owner atomically. `platform_set_organisation_status` requires a reason; updates take an organisation row lock and check the submitted version. All organisation updates increment the version, including tenant-owner edits. Reasons are intentionally visible to tenant members; no private support notes or integration secrets belong in these fields.

Suspension preserves role-scoped reads while restrictive write policies and triggers prevent employee, contract and membership mutations. Blocking also closes read policies and security-definer directory RPCs. Own membership/organisation metadata stays readable so members can see the restriction and switch workspaces. Employee/contract statuses are untouched. Write triggers take a shared organisation lock, so status changes wait for existing writes and subsequent writes see the restriction. Platform company metadata edits and restoration are still possible while a tenant is restricted.

## Audit

Employee/contract triggers write actor, organisation, action, entity, timestamp, and changed field names. Salary updates have their own action. Raw salaries and personal values are not duplicated in audit metadata. Organisation and membership functions also log changes. API callers cannot forge, modify, or delete audit events.

## Leave and attendance

Time tables have tenant foreign keys and RLS. Employee-specific data follows `can_read_employee`: HR/owner sees the tenant, managers their assigned staff plus themselves, and linked employees themselves. Types/calendar and organisation schedules are tenant-wide. Superadmins gain no implicit HR access. Authenticated callers have SELECT only; every write uses a checked RPC deriving author/tenant from the session.

Migration 013 adds `work_schedules`: organisation/employee effective dates, ISO weekdays and versions. Null employee weekdays mean inheritance. Resolution is company date exception → latest applicable employee pattern → latest organisation pattern → Monday–Friday. The HR-only writer takes the same organisation lock as leave/attendance, validates today-or-future changes, rejects stale writes, checks resulting days against pending/approved leave and audits changes. Historical schedule writes and direct client mutations are denied. Leave and attendance use the same employee-aware resolver. Payroll generation checks the whole month's recurring pattern against its Monday–Friday assumption.

Time mutations lock the organisation row, require active status and serialize allowance changes, requests, calendar changes, decisions and attendance. This prevents concurrent requests exceeding balances or creating overlap and coordinates with suspension/blocking. Decisions and attendance additionally compare submitted versions to reject stale edits.

Requests snapshot working dates when submitted and stay within one calendar year. Approved and pending days both reserve allowance; cancellation/rejection releases it. Changing working status on a date covered by a pending/approved request is refused. Leave type category/balance behavior is immutable after creation; names and availability can change. No statutory entitlement is inferred.

`attendance_month` checks employee access and combines manual entries, contract hours, calendar defaults and approved leave; salary is never returned. Migration 012 derives automatic worked hours for completed working days before today in Europe/Bucharest, with a unique applicable contract and eligible employment status. Automatic rows have category `automatic` and no manual version; an override is inserted with expected version null. Future/today and missing/ambiguous-contract work stays nullable. Approved leave overlays a whole day; cancellation restores derived hours. Manual work/absence conflicts still require correction before leave approval. Calendar changes can alter derived history but never overwrite manual records. `leave_calendar` aggregates the full permitted month under RLS.

Linked employees submit their own requests; HR may submit for others. HR/owners and assigned managers review others' requests. Self approval/rejection is prohibited. Employees cancel their pending requests; HR can cancel pending/approved ones. Reason fields are employee-visible and must not contain medical details. Audit stores actor/action/entity and changed field names rather than duplicating notes or personal values.

## Benefits

`benefit_providers`, `benefits`, `employee_benefits`, `benefit_runs` and `benefit_run_items` all belong to an organisation and use composite tenant foreign keys. Public API callers have SELECT only. HR/owner-checked security-definer RPCs manage catalogue/enrolment and prepare/review/approve months. They reuse the organisation lock to serialize writes with attendance, membership and access-state changes.

Benefits have a fixed model and editable amount/availability. One enrolment per employee/benefit carries its dates and availability. Annual spending is tracked across approved monthly items for that enrolment/year; flexible limits apply per month. Calculation inputs use employee status, contract dates/status, configuration versions, calendar/attendance and approved annual allocations, excluding salary. Missing/ambiguous/current employment states require HR review rather than inferred statutory eligibility.

Preparation stores human-readable benefit/provider/employee snapshots, rates, suggested and final amounts, review flags and the month's worked-day count. A canonical source hash rejects approval after relevant input changes. Source hashes are change detectors, not credentials or authorization. All exceptions must be explicitly reviewed; row/run versions reject stale updates. Repreparing a draft replaces its reviews; approved runs/items are immutable through the API. No approved-month correction workflow is included yet.

HR/owners see the tenant's catalogue and drafts. A linked employee or manager sees only their own enrolments, associated definitions and approved monthly items; assigned-staff benefit amounts remain private. Provider names are readable by tenant members. Global platform administrators gain no HR bypass. Suspension allows reads only; blocking closes all benefit reads and RPCs. Review notes are available to the employee after approval; monetary/personal values are not copied into audit metadata.

`BenefitsProvider` adapters for Pluxee, Edenred, Up România and custom providers are explicit unavailable implementations. They never simulate success or send network requests. Adding a real adapter requires verified provider documentation and a server-only credential design.

## Documents, lifecycle and payroll

Document metadata and lifecycle records have tenant/employee composite keys, version checks, active-company write checks and audited RPCs. HR owns checklist access; linked employees/managers see only their own ready employee-visible nonarchived documents. Superadmins have no bypass. A pending document reserves an exact `organisation/document.pdf` path; the authenticated uploader can insert only that object. Restrictive Storage policies prevent other buckets' permissive policies from granting read/write/overwrite/delete access. The server parses uploaded PDFs before finalisation. No public/signed URLs are issued; downloads use the user's JWT.

PDFs use a bundled Noto Sans font with Romanian glyph checks, A4 pagination and metadata. Generated payslips default to HR-only. Archive retains files/history indefinitely. Signed status is an HR attestation of an external signature, not cryptographic verification. The signature adapter rejects operations until a real provider is implemented.

Lifecycle tasks preserve completion actors, notes, versions and closure history. The owner-only offboarding step removes only this company's membership and employee/manager account links, protecting self/final-owner access. Closure rejects regranted access. Auth accounts, other memberships and historical HR records remain. Checklist confirmations do not automatically change contracts, benefits or government records.

Employee creation in the app starts the existing onboarding checklist and attempts invitation delivery after saving the employee. The profile presents a compact checklist with versioned toggles. Migration 011 queues employee invitations on insert; table writes are RPC-only. Acceptance verifies Auth's confirmed current email, single-use/expiry, MFA, active organisation/employee, account linkage, existing role and offboarding before atomically creating an employee membership and link. It never accepts a client-selected role or requires a service-role key. Delivery has a reservation/result and explicit renewal; a new invitation revokes the old one. No background sender or automatic resend is installed.

The payroll module is a pure, effective-dated supported-case calculator. Version `RO-2026-monthly-v3` includes full-month part-time contribution floors/evidenced exceptions, declared meal vouchers, paid advances and amounts with up to two decimals. Monetary arithmetic uses integer bani with explicit fiscal rounding. The server matches the current employee/contract, hours and salary, excludes recorded leave/absences and requires HR's explicit benefits review. Benefit allocations are not automatically treated as issued vouchers. The PDF snapshots entered facts, evidence references and computed results, but there is no structured payroll ledger or historical contract reconstruction yet. See [supported rules](payroll-rules.md); unsupported cases require separate handling. CAM and employer top-ups are indicative employee allocations, not employer-level filing.

## MFA and email boundaries

`private.session_meets_mfa()` checks the verified-factor table and JWT AAL. It gates role lookups, platform administration, organisation creation and otherwise independent own-membership reads, so database/Storage enforcement does not rely on route redirects. MFA is opt-in for all roles. A verified second authenticator is the supported self-service recovery preparation; administrative lost-factor recovery requires verified operator procedures.

Email is explicit and HR-controlled. A document must be ready, employee-visible and nonarchived, with a recipient matching the current employee record. A database reservation serialises attempts and stores pending/accepted/failed/uncertain outcomes. TLS SMTP credentials exist only on the server. No automatic retries after ambiguous outcomes; an operator must reconcile provider logs first. SMTP acceptance is not inbox delivery, and copies already sent/downloaded cannot be recalled. The client never receives SMTP secrets or raw provider errors.

## REGES, discovery and future additions

The REGES preparation table stores paired employer/author UUIDs with owner-only edits, HR reads and optimistic versions. The unavailable adapter does not exchange credentials or submit messages. [The integration plan](reges-integration.md) describes remaining schema mapping, encrypted credentials, an ordered PostgreSQL outbox and asynchronous result reconciliation.

`contract_reviews` records HR approval against the contract's database-maintained `review_version`. Every contract update increments it, so old reviews become stale. Neither review metadata nor the revision can be forged via normal column grants. Future queue construction must verify this state in its transaction and require reapproval for other changed payload data.

The Romanian product page, sitemap and robots route bypass session refresh. The product page overrides root noindex; private routes remain authenticated/noindex. No application navigation links point to the product page, at the user's request. White-label text uses the configured brand.

Each future module needs tenant keys, policies, actions and UI. Integration secrets require server-only encryption and key lifecycle before collection. Subscription billing remains a [proposal](billing-proposal.md). [Data protection requirements](data-protection.md) cover missing operational/legal and retention/rights procedures; no automatic compliance claim is made.

## Current limits

Migration 014 adds `privacy_requests`, immutable `privacy_request_events` and `privacy_exports`, with HR-only SELECT and checked security-definer RPCs for mutations. The existing organisation lock, active-status and MFA-aware HR helpers apply; no service-role access is added. Employee export data use explicit projections in one scoped query, with recorded history plus a bounded current attendance calculation. A preparation log is distinct from response evidence. The HR browser obtains private PDF copies through existing Storage policies and assembles a ZIP with readable HTML, JSON and integrity/scope metadata. Raw private object paths stay out of the archive. See [privacy workflows](privacy-workflows.md) for limits and omitted records; no automatic erasure or employee delivery is implemented.

- Organisation access is granted to already registered, confirmed accounts. Invitations and global account erasure remain deferred; company access can be revoked through offboarding.
- The employee's directory status and contract status are separately maintained; no automated legal or employment-status transitions are inferred.
- Contract amendments have a safe parent relationship, but a formal amendment workflow and immutable contract version history are deferred.
- Tax IDs and COR codes receive structural validation only; no government registry verification or legal compliance certification is claimed.
- Automatic payroll covers only the documented 2026 cases, including declared meal-voucher tax treatment. No automatic leave entitlement/pay, voucher eligibility/issuance, general benefit tax engine, D112 or bank execution is implemented. Benefit allocations use configured amounts and HR review.
