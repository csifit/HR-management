# Product roadmap

## Phase 1 — Foundation

Implemented: Next.js/TypeScript/Tailwind, Supabase authentication, organisation creation and switching, owner/HR/manager/employee roles, platform admin provisioning, tenant-safe RLS, dashboard layout, Romanian/English UI, deployment-wide white-label configuration, audit logging.

Expanded Superadmin implemented: membership-independent access, compact organisation accordions, search/status filters and pagination, company onboarding/contact fields, creation with a confirmed owner, reversible suspension/blocking with reasons and audit history, database enforcement and stale-edit protection. Stripe, trials and final pricing remain future work.

## Phase 2 — Employee and contract core

Implemented: directory, filters/search/pagination, create/edit employee, profiles, manager assignment, confirmed-account linking, contract create/edit/statuses, restricted salary information, activity history, and a same-employee parent-contract relationship for future addenda.

Later expansion within this phase: employee invitation emails, formal contract amendment workflow and immutable contract revisions where needed. Company access revocation is implemented through Phase 5 offboarding.

## Phase 3 — Leave and attendance

Implemented: full-day annual, medical, unpaid and configurable leave types; manually configured yearly allowances with approved/pending/available totals; employee requests, manager/HR decisions without self approval, cancellation, calendar/list views; daily planned/worked hours, monthly totals and absence categories. Approved leave appears automatically in attendance. Working calendar exceptions, audit, tenant boundaries and access-state enforcement are included.

Setup requires HR to configure yearly allowances and public holidays/company exceptions. The base schedule is Monday–Friday, 8 planned hours per working day, editable per date. No clock-in/out, partial-day leave, recurring employee schedules, automatic legal accrual or automatic leave-pay calculation. Future enhancements can add these after their rules are agreed.

## Phase 4 — Benefits

Implemented: tenant-owned provider catalogue and benefit definitions; employee enrolment dates; per-day/fixed/annual/flexible/non-financial models; attendance-aware monthly drafts, exceptions, HR adjustments and approval. Approved allocations and monthly worked-day totals are preserved. Annual/flexible limits, stale-source detection, audit, tenant access states and employee-only benefit visibility are enforced in PostgreSQL.

The user approved manual HR review for mid-month changes, recorded-worked-day counting, fixed amounts without automatic proration and manual annual/flexible allocations. Setup requires actual providers, rates and enrolments; no sample amounts are seeded. Provider adapters explicitly report unavailable. Exports, provider submissions, tax calculations, automatic proration and corrections to approved months are deferred.

## Phase 5 — Documents and lifecycle

Implemented: tenant-protected PDF Storage, metadata/statuses, summary/letter/payslip generation, own-employee visibility, archival, onboarding/offboarding checklists and owner-only scoped access revocation. MXroute delivery has explicit recipient review and attempt tracking; local connection/TLS/authentication passed a verify-only check. Vercel configuration and actual delivery remain unverified. Signature abstraction remains unavailable. Archive retains data; automatic erasure/retention workflows and real signing remain future work. Consult the checkpoint for live migration/Storage/UI verification status.

## Phase 6 — REGES integration framework

Implemented locally: owner-managed employer/author identifiers and a clearly disconnected integration screen, with tenant/MFA/version checks. The official guide/developer repository were reviewed. Remaining: data/schema mapping, encrypted credential lifecycle, official test access, submission queue/history and asynchronous result reconciliation. No live government request or mock success.

## Phase 7 — Payroll and accounting

The user explicitly requested an in-app payroll calculator. Implemented locally: effective-dated full-month 2026 CAS/CASS/income-tax and deduction calculations, net pay and printable private payslips. The selected expansion adds part-time contribution floors/evidenced exceptions, declared meal vouchers and paid salary advances. HR confirms eligibility and issuance; the current contract, hours and salary are checked before generation. See `payroll-rules.md` for precise supported facts, whole-RON limits and sources.

Remaining: accountant reference validation, fractional-leu earnings, partial months and leave pay, other benefits, income-tax exemptions, other deductions, corrections/payroll ledger, D112 and accounting exports/adapters. No bank payment execution. Broader payroll coverage must be added as tested, versioned rules, never inferred silently.

## Security, privacy, discovery and subscriptions

Optional TOTP MFA for every role is implemented with database/Storage enforcement once enrolled. Production provider flows and recovery procedures still need verification. Cozumel SRL is identified as provider. The privacy pack now includes a draft customer DPA, provider handbook, vendor register and restricted-register templates for rights, incidents, support and service exit. These need legal/operational completion and adoption; notices, actual retention/export/erasure processes, verified vendor terms and tested backup/restoration remain outstanding.

A public Romanian product page is indexable through its sitemap and has no inbound navigation/footer links. Search placement is not guaranteed. Stripe collections are proposed at €2 per billable employee/month, one company payment and a 30-day trial. The user will issue official invoices in SAGA. The billing proposal explains variable subscription quantities, internal Stripe Billing invoice records and SAGA reconciliation; count/trial/VAT/currency/grace rules must be finalised before building or charging.

Deployment target: Vercel. GitHub repository creation is managed by the project owner.
