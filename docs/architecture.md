# Initial architecture

One Next.js application and one Supabase PostgreSQL database. No microservices, queue infrastructure, ORM, or event bus.

## Data model

| Entity                    | Ownership and purpose                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `organisations`           | Tenant identity, name, CUI, creator, timestamps                                                |
| `organisation_users`      | Composite organisation/user membership; role and account display details                       |
| `employees`               | Organisation-owned directory and employment basics; optional linked account and manager        |
| `employment_contracts`    | Organisation and employee-owned contract details, salary, status, and optional parent contract |
| `audit_log`               | Append-only organisation-owned action history written by trusted triggers/functions            |
| `private.platform_admins` | Operator-provisioned global platform identities, with no implicit HR access                    |

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

| Role           | Employee directory                       | Contracts/salary                     | Organisation/access                              |
| -------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Owner          | All tenant employees; create/edit        | All tenant contracts; create/edit    | Edit organisation; grant/change membership roles |
| HR manager     | All tenant employees; create/edit        | All tenant contracts; create/edit    | Read memberships; no role grants                 |
| Manager        | Assigned employees and own linked record | Own linked employee's contracts only | Own membership and organisation metadata         |
| Employee       | Own linked record                        | Own contracts/salary, read-only      | Own membership and organisation metadata         |
| Platform admin | Requires a tenant role                   | Requires a tenant role               | Cross-tenant organisation metadata only          |

`create_organisation` atomically creates the tenant, its owner, and an audit event. Membership changes lock the organisation row, require ownership, preserve the final owner, and only link accounts to employees inside the same tenant. SQL helper functions have fixed empty search paths and explicit execute grants. The `private` schema is excluded from the Data API.

## Audit

Employee/contract triggers write actor, organisation, action, entity, timestamp, and changed field names. Salary updates have their own action. Raw salaries and personal values are not duplicated in audit metadata. Organisation and membership functions also log changes. API callers cannot forge, modify, or delete audit events.

## Future additions

Add each module with its own migration, organisation foreign key, policies, actions, and UI. Leave balances, attendance, benefits, protected Storage documents, workflow checklists, and provider adapters are intentionally absent until their phase. Integration secrets will need a server-only encrypted storage design and key lifecycle before any credentials are accepted. A normal PostgreSQL submission table can support REGES status tracking when required; successful provider calls must never be simulated in production.

## Current limits

- Organisation access is granted to already registered, confirmed accounts. Email invitations and membership removal are deferred.
- The employee's directory status and contract status are separately maintained; no automated legal or employment-status transitions are inferred.
- Contract amendments have a safe parent relationship, but a formal amendment workflow and immutable contract version history are deferred.
- Tax IDs and COR codes receive structural validation only; no government registry verification or legal compliance certification is claimed.
- No legal payroll, leave allowance, or benefit calculation is implemented.
