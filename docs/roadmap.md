# Product roadmap

## Phase 1 — Foundation

Implemented: Next.js/TypeScript/Tailwind, Supabase authentication, organisation creation and switching, owner/HR/manager/employee roles, platform admin provisioning, tenant-safe RLS, dashboard layout, Romanian/English UI, deployment-wide white-label configuration, audit logging.

Expanded Superadmin implemented: membership-independent access, compact organisation accordions, search/status filters and pagination, company onboarding/contact fields, creation with a confirmed owner, reversible suspension/blocking with reasons and audit history, database enforcement and stale-edit protection. Stripe, trials and final pricing remain future work.

## Phase 2 — Employee and contract core

Implemented: directory, filters/search/pagination, create/edit employee, profiles, manager assignment, confirmed-account linking, contract create/edit/statuses, restricted salary information, activity history, and a same-employee parent-contract relationship for future addenda.

Later expansion within this phase: employee invitation emails, membership removal/offboarding access revocation, formal contract amendment workflow, immutable contract revisions where needed.

## Phase 3 — Leave and attendance

Implemented: full-day annual, medical, unpaid and configurable leave types; manually configured yearly allowances with approved/pending/available totals; employee requests, manager/HR decisions without self approval, cancellation, calendar/list views; daily planned/worked hours, monthly totals and absence categories. Approved leave appears automatically in attendance. Working calendar exceptions, audit, tenant boundaries and access-state enforcement are included.

Setup requires HR to configure yearly allowances and public holidays/company exceptions. The base schedule is Monday–Friday, 8 planned hours per working day, editable per date. No clock-in/out, partial-day leave, recurring employee schedules, automatic legal accrual or payroll engine. Future enhancements can add these after their rules are agreed.

## Phase 4 — Benefits

Provider catalogue, benefit definitions, employee enrolment, per-day/fixed/annual/flexible/non-financial models, attendance-aware monthly preparation, exceptions, HR review and approval. No undocumented provider API calls.

## Phase 5 — Documents and lifecycle

Tenant-protected Supabase Storage, document metadata/statuses, onboarding/offboarding checklists, signature-ready abstraction. Access revocation and retention requirements must be explicit.

## Phase 6 — REGES integration framework

Integration settings, encrypted credential design, connection status, normal PostgreSQL submission queue/history, errors and attention states. Confirm official technical documentation before implementing production adapters; keep development mocks separate.

## Phase 7 — Payroll/accounting adapters

Provider interfaces and reviewed exports for SAGA, SAP, Microsoft Dynamics, Oracle and other systems. Store source salary/attendance/benefits information; do not implement a full payroll engine.

Deployment target: Vercel. GitHub repository creation is managed by the project owner.
