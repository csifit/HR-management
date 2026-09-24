# Product roadmap

## Phase 1 — Foundation

Implemented: Next.js/TypeScript/Tailwind, Supabase authentication, organisation creation and switching, owner/HR/manager/employee roles, platform admin provisioning, tenant-safe RLS, dashboard layout, Romanian/English UI, deployment-wide white-label configuration, audit logging.

Expanded Superadmin implemented: membership-independent access, compact organisation accordions, search/status filters and pagination, company onboarding/contact fields, creation with a confirmed owner, reversible suspension/blocking with reasons and audit history, database enforcement and stale-edit protection. Stripe, trials and final pricing remain future work.

## Phase 2 — Employee and contract core

Implemented: directory, filters/search/pagination, create/edit employee, profiles, manager assignment, confirmed-account linking, contract create/edit/statuses, restricted salary information, activity history, and a same-employee parent-contract relationship for future addenda.

Employee creation now attempts an MXroute invitation with employee-only acceptance by a verified matching account; HR sees delivery/expiry and can renew or revoke. Contract review records the HR reviewer and revision and becomes stale after edits. Formal amendments and immutable full contract history remain future work. Company access revocation is implemented through Phase 5 offboarding.

## Phase 3 — Leave and attendance

Migration 013 adds effective-dated organisation/employee weekday schedules, return to inheritance, read-only historical entries and transactional checks against pending/approved leave. Company date exceptions override these patterns. See `work-schedules.md` for rollout and limitations; rotating shifts remain future work.

Implemented: full-day annual, medical, unpaid and configurable leave types; manually configured yearly allowances with approved/pending/available totals; employee requests, manager/HR decisions without self approval, cancellation, calendar/list views; daily planned/worked hours, monthly totals and absence categories. Approved leave appears automatically in attendance. Working calendar exceptions, audit, tenant boundaries and access-state enforcement are included.

Setup requires HR to configure yearly allowances and public holidays/company exceptions. Completed working days now count contract hours automatically, per the user's choice, with approved leave taking precedence and manual corrections preserved. Today/future days remain planned. Missing/ambiguous/inactive contracts do not produce assumed work; the legacy eight-hour planning fallback remains. No clock-in/out, shift calendars, partial-day leave, automatic legal accrual or automatic leave-pay calculation.

## Phase 4 — Benefits

Implemented: tenant-owned provider catalogue and benefit definitions; employee enrolment dates; per-day/fixed/annual/flexible/non-financial models; attendance-aware monthly drafts, exceptions, HR adjustments and approval. Approved allocations and monthly worked-day totals are preserved. Annual/flexible limits, stale-source detection, audit, tenant access states and employee-only benefit visibility are enforced in PostgreSQL.

The user's later choice of automatic elapsed-day attendance supersedes recorded-only day counting. Benefit drafts include automatic days and flag them for HR review. Fixed amounts remain unprorated; annual/flexible allocations and mid-month adjustments remain manual. Setup requires actual providers, rates and enrolments; no sample amounts are seeded. Provider adapters remain unavailable. Exports, submissions, general benefit tax treatment, automatic proration and approved-month corrections are deferred.

## Phase 5 — Documents and lifecycle

Implemented: tenant-protected PDF Storage, metadata/statuses, summary/letter/payslip generation, own-employee visibility, archival, onboarding/offboarding checklists and owner-only scoped access revocation. MXroute delivery has explicit recipient review and attempt tracking; local connection/TLS/authentication passed a verify-only check. Vercel configuration and actual delivery remain unverified. Signature abstraction remains unavailable. Archive retains data; automatic erasure/retention workflows and real signing remain future work. Consult the checkpoint for live migration/Storage/UI verification status.

## Phase 6 — REGES integration framework

Implemented locally: owner-managed employer/author identifiers and a clearly disconnected integration screen, with tenant/MFA/version checks. HR reviews current contract revisions before future transmission; edits require another review. The official guide/developer repository were reviewed. Remaining: data/schema mapping, encrypted credentials, official test access, a queue enforcing current approval for its full payload, submission history and asynchronous reconciliation. No live government request or mock success.

## Phase 7 — Payroll and accounting

The user explicitly requested an in-app payroll calculator. Implemented locally: effective-dated full-month 2026 CAS/CASS/income-tax and deduction calculations, net pay and printable private payslips. The selected expansion adds part-time contribution floors/evidenced exceptions, declared meal vouchers and paid salary advances. HR confirms eligibility and issuance; the current contract, hours and salary are checked before generation. See `payroll-rules.md` for precise supported facts, whole-RON limits and sources.

Remaining: accountant reference validation, fractional-leu earnings, partial months and leave pay, other benefits, income-tax exemptions, other deductions, corrections/payroll ledger, D112 and accounting exports/adapters. No bank payment execution. Broader payroll coverage must be added as tested, versioned rules, never inferred silently.

## Security, privacy, discovery and subscriptions

Optional TOTP MFA for every role is implemented with database/Storage enforcement once enrolled. Production provider flows and recovery procedures still need verification. Cozumel SRL is identified as provider. The privacy pack now includes a draft customer DPA, provider handbook, vendor register and restricted-register templates for rights, incidents, support and service exit. These need legal/operational completion and adoption; notices, actual retention/export/erasure processes, verified vendor terms and tested backup/restoration remain outstanding.

A public Romanian product page is indexable through its sitemap and has no inbound navigation/footer links. Search placement is not guaranteed. Stripe collections are proposed at €2 per billable employee/month, one company payment and a 30-day trial. The user will issue official invoices in SAGA. The billing proposal explains variable subscription quantities, internal Stripe Billing invoice records and SAGA reconciliation; count/trial/VAT/currency/grace rules must be finalised before building or charging.

Deployment target: Vercel. GitHub repository creation is managed by the project owner.

The main public homepage now shows the €2/employee/month price discreetly, with tax details deferred to the offer. Employee profiles include a compact onboarding checklist backed by the existing versioned lifecycle tasks. New workflows require migrations 011–012 and the invitation confirmation redirect allowlist before deployment.
