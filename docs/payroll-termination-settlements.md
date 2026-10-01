# Termination settlement — 1 October 2026

Migration **019**, after **001–018**, adds optional `RO-2026-monthly-v5` entries. It does not rewrite previous approved v3/v4 calculations. Apply the migration before deploying this frontend. No new environment variables.

Migration **020** subsequently adds approved annual leave to v6 entries, including optional reviewed settlement components in the actual termination month. See [annual leave payroll](payroll-annual-leave.md) for that expanded scope. The v5-only boundaries below describe migration 019.

## Workflow

1. Record the actual inclusive termination date and set the contract to **terminated**. The employee/contract must meet the existing supported-period checks. Planned expiry alone is insufficient. Select the payroll month containing the actual termination date.
2. Resolve pending leave requests. Review statutory accrued entitlement, carryover, leave taken and any amounts already settled. Configured yearly allowances are planning records, not a calculated final entitlement. HR enters the confirmed unpaid unused-day balance; it is not prefilled.
3. Obtain the **accountant-approved gross daily rate**, including the appropriate historic/permanent pay components and applicable minimum. Record balance-review and rate-approval references. Days and rates accept up to two decimals; the rate supplied must already be approved at this precision.
4. Enable **Termination settlement**. Enter confirmed days and rate. Optionally enter an already-approved **fully taxable** other gross termination amount and its approval reference. The app does not determine a severance entitlement. Use zero/blank facts for a component that is absent; at least one component must be positive.
5. Keep the cash bonus separate. Compensation and other termination amounts must not appear again in bonus or be added again to net. Confirm the supported scope and normal attendance, calculate, compare with the accountant/SAGA, then save.
6. Review all included employees before closed-month approval. A change to contract/calendar/attendance/benefits, leave allowances or request facts requires reviewing and saving the affected settlement again. References identify externally held evidence; uploading or checking that evidence remains an HR/accounting duty.
7. Generate the approved payslip or accountant handover. v5 packages use **HRConnector-accountant-v3** with extra detailed CSV fields, saved settlement facts/components in the manifest and a separate printed settlement table. Older entries retain blank settlement fields. Net and remaining-pay already include the settlement. Corrections contain complete amounts, not differences; preserve originals and do not pay both revisions.

## Calculation and boundaries

Unused compensation is confirmed days × approved daily gross rate, rounded to bani with an exact half-ban upward. JavaScript multiplies bounded integer hundredths and bani; PostgreSQL uses exact numeric arithmetic. Regular earned basic retains the v4 working-day proration. The two settlement components join ordinary taxable cash for CAS, CASS, income tax and CAM using the existing supported 2026 rules. The contribution floor, monthly deductions, vouchers and paid advances retain their established treatment. Combined cash determines minimum-wage relief eligibility; unresolved **partial-month relief remains blocked with P0014**.

This phase covers ordinary fully taxable private-sector salary income **in the actual termination month**, with one unchanged RON contract, normal work and the supported Monday–Friday calendar. Leave in the employed interval, unpaid/no-show days, overtime, changing salary, overlapping contracts, exempt awards/damages, special public-sector restrictions, recoveries, later-month payments and tax exemptions remain outside the calculator. A settlement-only month with no employed working days is not supported. Do not change declarations to bypass these checks.

Approval does not execute payment, decrement leave allowances, submit REGES/D112, revoke access, calculate statutory accrual or automatically create a severance entitlement. Existing offboarding and account-access procedures remain separate. Approved exports read saved facts and amounts; they never calculate tax again or consult current employee/contract records.

## Sources and interpretation

Reviewed on 1 October 2026:

- [Labour Code, articles 146(3) and 150](https://legislatie.just.ro/Public/DetaliiDocument/249363): cash compensation for unused annual leave is permitted at termination; article 150 specifies historic daily-average/permanent-component and minimum rules for annual-leave indemnity. **Applying the relevant compensation valuation and minimum to the actual employee is left to the approving accountant**, because the app lacks complete pay-component history.
- [Labour Inspectorate / REGES annual-leave FAQ](https://reges.inspectiamuncii.ro/ajutor/intrebari-frecvente/?faqid=8098) corroborates the termination-only cash-compensation boundary.
- [ANAF consolidated Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm), articles 76, 139(1)(q), 157(1)(ș), 220³ and 220⁴: ordinary employment income and employer-funded contractual compensatory pay enter the applicable salary/contribution bases. The implementation treats the explicitly confirmed components as ordinary fully taxable cash; it does not classify special awards or exemptions.
- Existing [full-month rules](payroll-rules.md) and [partial-month rules](payroll-partial-month-rules.md) document deductions, contribution floors and unresolved relief rounding.

The confirmed-balance/rate inputs, two-decimal precision, multiplication rounding and ordinary cash aggregation are explicit application conventions and a bounded interpretation of these sources, not independent accountant certification.

## Verification checklist

- Use synthetic records with a terminated contract and actual end date in the selected month. Compare fractional days/rate, optional other gross, bonus, vouchers, advance and part-time floors against SAGA/accountant results.
- Check that active/planned-only/wrong-month contracts and pending leave cannot save a settlement. Changing source facts after save must block approval until reviewed/resaved. Ordinary v3/v4 sources remain unchanged by this migration.
- Confirm preview, saved component details, approved payslip and the v3 accountant archive agree. Check RO/EN and narrow screens; edit any input after preview and confirm Save disables until recalculation.
- Test correction/history without changing original approved figures. Verify employee/manager/other-tenant/platform-admin accounts cannot access HR payroll RPCs, and enrolled MFA/organisation status checks still apply.
- All production migration, Storage, live UI and accountant comparison checks are performed by the owner; local synthetic tests do not establish those results.
