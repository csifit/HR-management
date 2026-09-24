# Romanian payroll calculator — supported 2026 cases

Rule identifier: `RO-2026-monthly-v3`. Rounding references reviewed on 24 September 2026. This is a bounded payroll calculation module, not a D112 filing system, bank payment system or complete treatment of every Romanian employment situation. Have the organisation's payroll accountant validate representative results before relying on them for payments.

## Supported facts and calculations

With migration 013, payslip generation requires a Monday–Friday recurring schedule throughout the selected month. Other weekday patterns need separate payroll review; adding attendance schedules does not expand the tax calculator's supported contract assumptions.

The calculator accepts basic salary, fully taxable cash bonuses, legally issued meal vouchers and salary advances with **up to two decimal places (lei and bani)** for full-month Romanian tax-resident employees under normal working conditions during January–December 2026. Advances must already have been paid. Normal full time is eight hours/day; shorter contractual schedules are supported with the basic minimum scaled to hours. CAS, CASS, income tax, personal deductions, net cash pay and the remaining payment are computed automatically. CAM and employer cost are indicative employee allocations; aggregate employer rounding is not a tax-return calculation.

The basic minimum is RON 4,050 through June and RON 4,325 from July. The RON 300/200 allowance applies only to full-time primary employment at the exact statutory basic minimum, within the RON 4,300/4,600 cash-gross caps, with no disqualifying basic-pay reduction. Meal vouchers do not consume these allowance caps. Part-time contracts do not receive this allowance.

For example, a four-hour July contract at RON 2,162.50 is accepted without changing its salary. The server requires the entered basic salary and hours to match the current contract. Inputs accept a decimal point or comma without thousands separators; empty, negative, non-finite and overprecision money inputs are rejected, never silently rounded. Contract hours also support up to two decimal places. The gross limit remains RON 1,000,000.

### Part-time contribution floors

Employee CAS is 25% of the cash contribution base and CASS is 10% of the cash base plus meal vouchers. For a full month, the 2026 minimum contribution base is reduced to RON 3,750 in January–June and RON 4,125 in July–December. Any shortfall is paid by the **employer**, separately for CAS and CASS, and never deducted from employee net pay.

HR can declare a supported exception with a short evidence reference valid for the payroll month: qualifying student, apprentice, disability/statutory reduced-hours case, qualifying public-system old-age pensioner or multiple contracts meeting the statutory aggregate threshold. The detailed eligibility limits and exclusions in Fiscal Code article 146(5^7) still apply. The app does not infer eligibility from age, pension status or this organisation's contract list. These exceptions remove only the employer-funded floor top-up; they do not grant an income-tax exemption. Cases needing that exemption remain outside this release.

### Meal vouchers and advances

Enter the actual value of legally issued meal vouchers, at primary employment only, and an issuance reference. HR must confirm eligibility, daily/working-day limits and actual issuance; a benefit allocation is not proof of issuance. Vouchers enter CASS and taxable gross earnings (including personal-deduction bands) but not CAS or CAM. Their value is never added to cash paid to the employee. The associated CASS and income tax reduce cash pay.

Enter an advance only after it has actually been paid for this payroll month, with a payment reference. It reduces the remaining cash payment after taxes; it does not reduce gross earnings, tax bases or net salary. Advances above calculated net cash and cases with negative cash pay are rejected. This feature records the fact on a PDF; it does not create or reconcile a bank payment.

### Personal deductions and rounding

Personal deductions use dependent bands, the primary-employment restriction and the minimum-plus-RON-2,000 gross threshold, including vouchers. Eligible young-person and school-child deductions are included. HR confirms eligibility from evidence; children's identities are not collected. Deductions are capped by available taxable income.

The implementation carries earnings, vouchers, advances and intermediate monetary sums as integer bani. Minimum-salary and allowance checks use the exact amounts. The deduction table uses the actual gross amount: each RON 50 upper bound is inclusive, and any excess enters the next band. This interpretation of the current article 77 table, including fractional amounts at band edges, must be included in the accountant's independent reference checks; the obsolete 2016 fixed-amount table is not reused.

Rounding is applied only at explicit steps:

- CAS, CASS and indicative CAM round to whole lei with an exact half-leu rounded up, following OUG 59/2005 article 1. Employer top-ups are differences between rounded floor contributions and employee contributions.
- Title IV fixed deductions retain article 66's half-leu-down convention. The taxable income after deductions is rounded to whole lei **before** applying the income-tax rate, following norm 4 under article 64. The calculated income tax also retains the calculator's Title IV half-leu-down convention.
- Net cash retains any bani in earnings after whole-leu deductions; the advance is subtracted exactly. Pre-rounding taxable income is shown in the preview and, when different, on the payslip alongside the rounded base. CAM and employer aggregate reporting still require separate reconciliation.

Version v3 does not alter stored PDFs. New PDFs snapshot v3; older v1/v2 documents retain their original figures and rule identifier. Independent accountant/SAGA validation remains outstanding, particularly for deduction-band and exact-half rounding boundaries.

## Reference regression cases

September 2026, primary employment, zero dependants, no young-person or school-child deduction and no salary reduction; amounts in RON:

| Facts                                                                 | Employee CAS / CASS / tax | Net cash | Employer floor top-ups CAS / CASS | Remaining cash |
| --------------------------------------------------------------------- | ------------------------- | -------- | --------------------------------- | -------------- |
| 4 hours, basic 2,200                                                  | 550 / 220 / 56            | 1,374    | 481 / 193                         | 1,374          |
| 4 hours, basic 2,162.50, advance 500.25                               | 541 / 216 / 54            | 1,351.50 | 490 / 197                         | 851.25         |
| Same, evidenced qualifying student exception                          | 550 / 220 / 56            | 1,374    | 0 / 0                             | 1,374          |
| 4 hours, basic 2,200, vouchers 800, advance 500                       | 550 / 300 / 128           | 1,222    | 481 / 113                         | 722            |
| 8 hours, basic 10,000, vouchers 800                                   | 2,500 / 1,080 / 722       | 5,698    | 0 / 0                             | 5,698          |
| 8 hours, basic 10,000, advance 500                                    | 2,500 / 1,000 / 650       | 5,850    | 0 / 0                             | 5,350          |
| 8 hours, basic 10,000.10, bonus 0.20, vouchers 800.15, advance 500.25 | 2,500 / 1,080 / 722       | 5,698.30 | 0 / 0                             | 5,198.05       |

These are checked implementation examples, not independent accountant approval.

## Server checks, evidence and exclusions

PDF generation rechecks active employee status, one overlapping active RON contract covering the whole month, and matching basic salary/hours. Recorded approved leave and absences block generation. HR must explicitly review benefits and confirm that all payroll-relevant benefits are the meal vouchers entered; other taxable benefits require separate handling. The previous blanket active-benefit block is replaced by that declaration. The app does not automatically classify catalogue benefits or import approved allocations as issued vouchers.

Unsupported: other tax years, amounts with more than two decimals, partial months, leave adjustments, historical contract reconstruction, foreign tax/social-security situations, special working conditions, other benefits, income-tax exemptions, other deductible expenses and garnishments. No automatic attendance-based gross-pay proration, D112, accounting posting, payroll-run ledger/corrections or bank execution.

PDFs snapshot inputs, references, calculations, period and rule version and start HR-only. References should contain no diagnoses or other people's identifiers. After review HR can make an individual document employee-visible and explicitly email it. Regeneration creates a new document; archive superseded copies. A PDF or successful email does not prove salary payment.

## Primary references

- [ANAF consolidated Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm): articles 66, 77–78, 138, 142, 146(5^6)–(5^9), 156–157, 168(6^1), 220³–220⁴ and relevant norms. Despite its historical filename, the page contains consolidated 2026 amendments; recheck before changing rules.
- [HG 146/2026](https://legislatie.just.ro/Public/DetaliiDocument/308231): July minimum basic salary.
- [OUG 89/2025, article III, consolidated](https://legislatie.just.ro/Public/DetaliiDocument/309360): allowance and contribution-floor reductions.
- [ANAF 2026 allowance explanation](https://static.anaf.ro/static/3/Galati/20260123122801_suma%20neimpozabila%20in%202026.pdf) and [ANAF January 2026 changes](https://static.anaf.ro/static/10/Brasov/Brasov/web_ian_2026.pdf).
- [2026 D112 instructions](https://static.anaf.ro/static/10/Anaf/legislatie/OPANAF_605_2026.pdf): contribution-base reductions and reporting context. The app does not produce D112.
- [Fiscal Code norms, title IV, norm 4 under article 64](https://legislatie.just.ro/Public/DetaliiDocument/245650): rounding the income-tax base to whole lei before calculating tax.
- [OUG 59/2005, article 1](https://legislatie.just.ro/Public/DetaliiDocument/69521): general whole-leu rounding of taxes/contributions; the specific Title IV convention is described above.

Next expansions require confirmed cases and independent reference outputs: partial months/leave pay, other benefits and deductions, special exemptions, corrections and employer-level reporting. Never silently reuse 2026 rules for another year.
