# Annual leave payroll — 1 October 2026

Migration **020**, after **001–019**, adds `RO-2026-monthly-v6`. Apply `202610010020_payroll_annual_leave.sql` before deploying the frontend. No new dependency or environment variable is needed. Earlier approved v3/v4/v5 entries and their export formats stay unchanged.

## Workflow

1. Configure the organisation's public holidays and calendar exceptions before requesting leave. Approve full-day annual leave through **Leave**. Payroll supports the existing uniform Monday–Friday schedule and one unchanged eligible RON contract. The app does not import holidays or calculate legal entitlement automatically.
2. Open the employee's monthly payroll entry. Approved working dates inside this month appear automatically, grouped by request. Dates are read-only. Requests crossing month boundaries contribute only their included dates to each month's entry. Each request has its own rate and approval reference, allowing the accountant to supply the rate appropriate to the dates in that payroll month.
3. Obtain an **accountant-approved gross daily rate**, including the preceding three-month pay bases, permanent pay components and applicable minimum. Enter it with up to two decimals and a reference identifying externally held approval evidence. The app lacks complete historical component data and cannot derive this rate. It also checks the known minimum attributable to current contractual basic pay; this check alone cannot establish the full statutory minimum.
4. Review the dates, remaining normal working days, benefit issuance and all rate evidence. Cash bonus stays separate; do not enter leave pay again as bonus. Vouchers are actual legally issued amounts and must exclude ineligible leave days. An amount already paid **for this payroll month** belongs once in the paid advance field. Prepayments allocated to other months need separate accountant reconciliation and are outside this version.
5. Calculate, compare with the accountant/SAGA, then save. Closed-month approval rechecks approved request IDs, dates, status, version and type, as well as employment, calendar, schedule, attendance and benefit facts. Later changes block approval until reviewed/resaved. Cancelled leave must be removed by refreshing and saving the normal entry. Pending decisions in the employed interval block annual-leave payroll.
6. Generate the approved payslip or accountant package. Saved components identify basic pay for worked days and gross annual-leave pay. Packages containing v6 use **HRConnector-accountant-v4**: detailed CSV dates/rates/references, manifest facts and amounts, and a separate printable annual-leave table. Older rows retain blank annual-leave fields. Corrections contain full amounts, not deltas; retain the original and pay only the appropriate approved revision.

## Calculation and boundaries

Basic pay for worked days is monthly contractual basic × (employed working days − approved annual-leave working days) / month working days, rounded to bani with exact half-ban upward rounding. Leave gross is the sum of each request's included whole working days × its approved two-decimal daily rate. Each request's amount must cover the rounded current-basic share for its days. All-month annual leave yields zero worked basic; it still has leave pay. Salary changes and more complex minimum/component comparisons require external calculation.

Example: a RON 10,000 monthly basic, 22 employed/month working days and two approved leave days at RON 500.25 produce RON 9,090.91 worked basic plus RON 1,000.50 leave gross = RON 10,091.41 cash gross before bonus or settlement. Full basic is not added again. This is an application arithmetic example, not an independently certified payroll reference.

The combined ordinary taxable cash enters the existing supported v4 contribution/deduction rules, including actual vouchers and advances. The part-time floor uses employed working days, including paid annual leave. Full-month minimum-wage relief considers combined cash; unresolved **partial-month relief stays blocked with P0014**. Optional reviewed termination components may join v6 in the actual termination month under the existing settlement checks. Original bonus remains unchanged in saved input.

The calendar and approved request work dates must agree; duplicates, now-nonworking dates and dates outside employment fail closed. Normal manual attendance is allowed; an approved leave date must have zero worked hours, its normal contract plan and no conflicting manual absence. Remaining days must be worked normally. Medical/unpaid leave, no-shows, overtime, changing salary, rotating/weekend schedules, tax exemptions, later-month settlement-only payments and other unsupported adjustments remain excluded. Do not alter eligibility declarations to bypass a check.

**Payment timing remains external.** Labour Code article 150(3) requires annual-leave indemnity payment at least five working days before leave. Monthly calculation/approval does not make that payment or satisfy its deadline. The accountant/employer must arrange and document it separately; payroll here reconciles the supported current-month paid advance. No bank execution, automatic pre-leave payout, statutory accrual, allowance decrement, D112 or REGES submission is added.

## Sources and interpretation

Reviewed on 1 October 2026:

- [Labour Code, articles 145–150](https://legislatie.just.ro/Public/DetaliiDocument/249363): paid annual leave, exclusion of public holidays from annual-leave days, historical average/permanent-component and applicable-minimum rules, and pre-leave payment timing. Actual historic bases, components, applicable rates and payment evidence remain the accountant/employer's responsibility.
- [ANAF consolidated Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm), articles 76, 139, 157 and 220⁴: ordinary salary/contribution bases. v6 treats the explicitly confirmed annual-leave indemnity as ordinary taxable employment cash and retains the existing documented fiscal calculations.
- [Full-month rules](payroll-rules.md), [partial-month rules](payroll-partial-month-rules.md) and [termination settlements](payroll-termination-settlements.md) document the retained tax scope, rounding and unresolved cases.

Per-request approved rates, current-basic checks, working-day basic proration and current-month advance reconciliation are explicit application conventions. Local JS/SQL parity tests do not establish independent legal/accountant certification.

## Owner release checks

- Apply **020 once**, then deploy. Do not reapply released 019. Refresh/resave affected old drafts; approved snapshots stay unchanged.
- Use synthetic requests for a normal month, cross-month leave, public holiday, separate rates, all-month leave and a part-time employee. Compare basic replacement, CAS/CASS/tax, voucher eligibility, advances and optional termination components with accountant/SAGA references before payment reliance.
- Check RO/EN and narrow screens: approved dates, required rate/reference/confirmations, calculate/save, closed-month approval, source-change rejection and correction history. Editing any input after preview must disable Save until recalculation.
- Download payslip and mixed v3–v6 accountant ZIP; compare saved components, full request dates/rates/references, totals and remaining pay. References are external evidence identifiers, not proof that the accountant reviewed a document.
- Verify employee/manager/other-tenant/platform accounts cannot use HR payroll RPCs; enrolled MFA and suspended/blocked status still apply. Email delivery remains explicit under the existing document workflow.
- Production migration/UI/Storage checks and accountant reference comparison are owner tasks. The assistant's tests use local synthetic fixtures and do not modify live HR data.
