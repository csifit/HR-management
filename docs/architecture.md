# Architecture

One Next.js application and one Supabase PostgreSQL database. No microservices, queue infrastructure, ORM, or event bus.

## Data model

| Entity                    | Ownership and purpose                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `organisations`           | Tenant identity, onboarding/contact details, access status/reason, version, creator, timestamps |
| `organisation_users`      | Composite organisation/user membership; role and account display details                        |
| `employees`               | Organisation-owned directory and employment basics; optional linked account and manager         |
| `employment_contracts`    | Organisation and employee-owned contract details, salary, status, and optional parent contract  |
| `leave_types`             | Tenant-owned leave categories, allowance behavior and availability                              |
| `leave_balances`          | Per-employee/type/year allowance configured by HR                                               |
| `work_calendar_days`      | Tenant working/non-working exceptions to Monday–Friday                                          |
| `leave_requests`          | Full-day requests, counted-date snapshot, status, decision actor/reason and version             |
| `attendance`              | Per-employee/day planned/worked hours, absence category, last editor and version                |
| `audit_log`               | Append-only organisation-owned action history written by trusted triggers/functions             |
| `private.platform_admins` | Operator-provisioned global platform identities, with no implicit HR access                     |

Employee and contract IDs are globally unique, but references include `organisation_id` so cross-tenant employee, manager, account, and parent-contract links cannot be stored. A parent contract must belong to the same employee as its addendum. Organisation IDs and audit authors cannot be changed by authenticated API callers.

Contracts hold salary separately from the employee directory. Managers therefore cannot retrieve salary by requesting extra directory columns. No CNP, medical details, birth date, home address, document binaries, or integration credentials are collected in this slice.

## Request path

1. The Next.js proxy refreshes Supabase session cookies. It does not make authorisation decisions.
2. Server pages/actions call `requireUser()` which validates the session with `auth.getUser()`.
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

All five time tables have tenant foreign keys and RLS. Employee-specific data follows `can_read_employee`: HR/owner sees the tenant, managers their assigned staff plus themselves, and linked employees themselves. Types/calendar are tenant-wide. Superadmins gain no implicit HR access. Authenticated callers have SELECT only; every write uses a checked RPC deriving author/tenant from the session.

Time mutations lock the organisation row, require active status and serialize allowance changes, requests, calendar changes, decisions and attendance. This prevents concurrent requests exceeding balances or creating overlap and coordinates with suspension/blocking. Decisions and attendance additionally compare submitted versions to reject stale edits.

Requests snapshot working dates when submitted and stay within one calendar year. Approved and pending days both reserve allowance; cancellation/rejection releases it. Changing working status on a date covered by a pending/approved request is refused. Leave type category/balance behavior is immutable after creation; names and availability can change. No statutory entitlement is inferred.

`attendance_month` checks employee access and combines daily entries, calendar defaults and approved leave; it never reads salary. A missing record has nullable worked hours and is not counted as worked. Approved leave overlays an entire working day. Approval rejects conflicting attendance; saving attendance on approved leave is refused. `leave_calendar` aggregates the full permitted month under RLS, independent of the 25-row request list.

Linked employees submit their own requests; HR may submit for others. HR/owners and assigned managers review others' requests. Self approval/rejection is prohibited. Employees cancel their pending requests; HR can cancel pending/approved ones. Reason fields are employee-visible and must not contain medical details. Audit stores actor/action/entity and changed field names rather than duplicating notes or personal values.

## Benefits

`benefit_providers`, `benefits`, `employee_benefits`, `benefit_runs` and `benefit_run_items` all belong to an organisation and use composite tenant foreign keys. Public API callers have SELECT only. HR/owner-checked security-definer RPCs manage catalogue/enrolment and prepare/review/approve months. They reuse the organisation lock to serialize writes with attendance, membership and access-state changes.

Benefits have a fixed model and editable amount/availability. One enrolment per employee/benefit carries its dates and availability. Annual spending is tracked across approved monthly items for that enrolment/year; flexible limits apply per month. Calculation inputs use employee status, contract dates/status, configuration versions, calendar/attendance and approved annual allocations, excluding salary. Missing/ambiguous/current employment states require HR review rather than inferred statutory eligibility.

Preparation stores human-readable benefit/provider/employee snapshots, rates, suggested and final amounts, review flags and the month's worked-day count. A canonical source hash rejects approval after relevant input changes. Source hashes are change detectors, not credentials or authorization. All exceptions must be explicitly reviewed; row/run versions reject stale updates. Repreparing a draft replaces its reviews; approved runs/items are immutable through the API. No approved-month correction workflow is included yet.

HR/owners see the tenant's catalogue and drafts. A linked employee or manager sees only their own enrolments, associated definitions and approved monthly items; assigned-staff benefit amounts remain private. Provider names are readable by tenant members. Global platform administrators gain no HR bypass. Suspension allows reads only; blocking closes all benefit reads and RPCs. Review notes are available to the employee after approval; monetary/personal values are not copied into audit metadata.

`BenefitsProvider` adapters for Pluxee, Edenred, Up România and custom providers are explicit unavailable implementations. They never simulate success or send network requests. Adding a real adapter requires verified provider documentation and a server-only credential design.

## Future additions

Add each module with its own migration, organisation foreign key, policies, actions, and UI. Protected Storage documents, workflow checklists, and live provider adapters are intentionally absent until their phase. Integration secrets will need a server-only encrypted storage design and key lifecycle before any credentials are accepted. A normal PostgreSQL submission table can support REGES status tracking when required; successful provider calls must never be simulated in production.

## Current limits

- Organisation access is granted to already registered, confirmed accounts. Email invitations and membership removal are deferred.
- The employee's directory status and contract status are separately maintained; no automated legal or employment-status transitions are inferred.
- Contract amendments have a safe parent relationship, but a formal amendment workflow and immutable contract version history are deferred.
- Tax IDs and COR codes receive structural validation only; no government registry verification or legal compliance certification is claimed.
- No statutory payroll, leave entitlement, benefit eligibility or tax calculation is implemented. Benefit allocations use configured amounts and HR review.
