# Unpaid leave and absence payroll

Migration **202610010021_payroll_unpaid_absences.sql**, after 001–020, adds separate JS/PostgreSQL **RO-2026-monthly-v7** rules. Older approved v3–v6 calculations, source snapshots and correction history remain unchanged. This workflow supports full days within the existing 2026, one unchanged RON contract, uniform Monday–Friday scope. It does not establish a statutory reason for an absence or formally suspend employment.

## HR workflow

1. Resolve leave decisions and review the month's attendance. Approved unpaid requests supply their saved working dates, clipped to this month; approved annual leave remains a separate paid component. Holidays and dates outside actual employment cannot become unpaid working dates.
2. A full zero-work manual attendance record with the normal contractual planned hours and category `none`, `unpaid` or `other`, outside approved leave, appears for HR review. These generic labels are not proof of a lawfully unpaid absence. HR must establish that classification against the employment records and enter a review/accountant reference. A paid special absence, recoverable family emergency, medical leave or disputed classification must use separate handling.
3. Mark only unpaid working dates covered by an actual formal contract suspension, and enter its evidence reference. Nothing is selected automatically on a new calculation. All unmarked dates retain active-contract treatment for the contribution floor. Confirm that no other suspension affecting the month is missing. These declarations do not change contract status or transmit REGES data; those records and actions remain external.
4. Review actual vouchers issued for eligible days, bonuses, any approved annual-leave rate/termination components and the already-paid advance for this payroll month. Confirm the calendar, classification and evidence, then preview and save the calculation. References should identify records, not include sensitive absence narratives or medical details.
5. Approve a closed month's revision after accountant review. Leave/attendance/calendar/employment changes block approval until the affected calculation is reviewed and saved again. Corrections preserve the original approved snapshot; downloaded or emailed earlier PDFs cannot be recalled.

The form derives every supported source date; HR cannot silently omit an unpaid request or zero-work date. It rejects duplicate dates, annual/unpaid overlap, forged sources, pending decisions, unsupported paid/medical leave, reduced or extra hours, working weekends, changed salaries, ambiguous contracts and unsupported employment states. Source snapshots include request IDs/type/status/version/full work dates and attendance versions, without leave decision notes. HR-only actions retain the existing organisation lock, tenant, status, MFA and optimistic-version checks.

## Amounts and contribution floor

Let `M` be month working days, `E` employed working days, `A` approved annual-leave days, `U` reviewed unpaid days and `S` explicitly confirmed formally suspended working days. Unpaid dates and annual dates are disjoint; `S` is a subset of `U`.

- Worked basic = monthly contractual basic × `(E − A − U) / M`, rounded once to bani, half-up.
- Excluded basic = rounded basic × `(E − A) / M` minus the saved worked basic. This difference avoids an additional independently rounded deduction.
- Taxable cash = worked basic + separately reviewed annual-leave gross + original bonus + any reviewed ordinary taxable termination settlement, each included once. The existing v4 tax, deduction, voucher and advance treatment applies.
- Active floor days = `E − S`. Unpaid classification alone does not reduce this count. The existing effective month's contribution floor is prorated by active floor days/month working days, rounded to lei before contributions. Employer top-ups remain employer-funded.

Example under a 22-working-day January calendar: basic RON 2,025, two approved unpaid days and one reviewed zero-work day produce worked basic RON 1,748.86 and excluded basic RON 276.14. With no formal suspension declared, the January contribution floor remains RON 3,750; with two evidenced suspended working dates it becomes RON 3,409. The earned salary is identical in both cases. This is an application convention for the supported schedule, not a universal legal formula or independently validated SAGA output.

**P0015 blocks qualifying minimum-wage relief cases with unpaid dates**, because precise relief proration/rounding remains unresolved, including otherwise full employed months. It also blocks zero cash with active contract working days. Do not change eligibility or suspension answers to bypass review. A fully suspended month with zero cash and zero active working days can produce zero figures when it is not a relief-review case; this does not establish health-insurance entitlement, reporting treatment or D112 filing. Negative net cash or an advance exceeding net is rejected.

Partial-day absence, medical leave, paid special/emergency absence, rotating schedules, other suspensions, cross-month prepayment reconciliation, other tax years and unsupported benefits/exemptions remain outside this version. There is no disciplinary action, payroll penalty, statutory leave accrual, automatic contract-state change, D112, bank payment or REGES submission. Annual-leave rates and unused-leave balances still need their separate external evidence.

## Saved documents and accountant handover

Preview, saved details and approved payslips show worked/excluded basic, unpaid dates, active floor days and review/suspension references. Short RO/EN payslips stay compact while retaining readable body text; longer evidence can paginate. Zero optional relief/supplementary-deduction rows are omitted only on v7 payslips.

An accountant package containing v7 uses **HRConnector-accountant-v5**. It adds unpaid/suspended/active counts, saved components and complete input facts to `payroll.csv` and the manifest, plus a dedicated printable table with full request IDs/dates/references. Mixed v3–v7 packages retain older facts and blank unavailable columns. The excluded basic is already absent from gross; do not deduct it again from net. Downloads validate saved structures and consistent date/component facts without recalculating tax or reading mutable current employee/leave records. Preparation history, integrity hashes, access limits and explicit delivery remain unchanged. This is a review package, not a SAGA import or payment instruction.

## Primary sources and interpretation

Reviewed 1 October 2026:

- [Labour Code](https://legislatie.just.ro/Public/DetaliiDocument/249363), articles 49(2), 51(2), 54 and 153: suspension affects work/pay; unjustified absence and unpaid personal/study leave require their applicable legal/employment basis. Article 152² addresses a distinct recoverable emergency absence. The application therefore requires HR classification and separate suspension evidence rather than inferring legal effect from a generic attendance label.
- Fiscal Code articles 146(5⁶) and 168(6¹), and the current 2026 amounts/rounding sources already recorded in [partial-month rules](payroll-partial-month-rules.md), underpin the retained contribution-floor calculation. [Order 1855/2022](https://legislatie.just.ro/public/DetaliiDocument/258471), article 1(2)(b), article 1(3) and example 3, expressly distinguish an active contract from a suspended one and illustrate working-day proration. That order governs the multiple-contract exception procedure; it corroborates the distinction, rather than being a universal absence-classification rule.
- The [existing relief analysis and unresolved rounding](payroll-partial-month-rules.md#minimum-wage-relief-remains-excluded-for-partial-month-candidates) also apply when unpaid days make relief proportionate. No new unverified relief rounding or reporting rule is introduced.

These sources do not provide the app with the customer's suspension records, complete pay history or an independent payroll reference. The HR/accountant confirmations and working-day salary convention are explicit boundaries, not a claim of certified legal compliance.

## Owner release and acceptance checks

Check actual migration history first. Apply **021 once after 020** before deploying this frontend; do not reapply earlier migrations already present. The owner's application/deployment of 020 has not been explicitly confirmed in this checkpoint. No new environment variable or dependency is required. The owner manages the development server; the assistant does not run `npm run dev`.

Use synthetic records in RO/EN and at narrow screen width:

- Approved unpaid leave plus a full zero-work attendance date appear once, with editable review references and no initially selected suspension dates. Verify a paid special/medical/partial-hour case remains unavailable.
- Confirm suspension evidence becomes required when dates are selected and is disabled/empty when none are selected. Compare unchanged salary and different contribution floors against accountant/SAGA reference cases for full/partial months, part-time contracts and an eligible floor exception.
- Combine annual leave, unpaid days, actual vouchers, a paid advance and an evidenced termination settlement; confirm no basic-pay/advance duplication and unchanged original bonus. Check cross-month requests and changed calendars against the source dates.
- Save, change a source and confirm approval is blocked; refresh, review/resave, approve and create a correction. Original approved amounts and evidence must remain fixed.
- Download RO/EN payslips and mixed-version accountant packages. Verify dates, references, saved amounts, hashes and absence of any second net deduction. Review long evidence and Romanian glyphs.
- Verify employee/manager/other-tenant/platform denial, enrolled MFA and suspended/blocked access. Confirm Storage completion and any explicit delivery through the existing document workflow separately.

Local tests use synthetic PGlite fixtures and PDF exports. They do not establish live Supabase/Storage/UI state, independent accountant accuracy or actual suspension/REGES records.
