# Romanian payroll calculator — first supported release

Rule identifier: `RO-2026-standard-v1`. Reviewed against primary sources on 23 September 2026. This is a bounded payroll calculation module, not a D112 filing system, bank payment system or complete treatment of every Romanian employment situation. Have the organisation's payroll accountant validate representative results before relying on them for payments.

## Supported facts and calculations

The calculator accepts whole-RON basic salary and fully taxable cash bonuses for full-time, full-month Romanian tax-resident employees under normal working conditions during January–December 2026. It computes employee CAS, CASS, income tax, personal deductions and net pay automatically. CAM and employer cost are shown as an indicative employee allocation; employer-level aggregate rounding is not a tax-return calculation.

The tax rules are effective-dated: minimum basic salary is RON 4,050 through June and RON 4,325 from July. The corresponding full-month allowance is RON 300/200 only for primary employment at the exact statutory basic minimum, within the RON 4,300/4,600 gross caps, and with no disqualifying basic-pay reduction. Full-month assumptions matter; the calculator does not infer entitlement from a gross amount alone.

Personal deductions use the dependent bands, primary-employment restriction and the minimum-plus-RON-2,000 threshold. Additional eligible young-person and school-child deductions are included. The operator confirms eligibility from evidence; the app deliberately does not collect children's identities. Deductions are capped by available taxable income. Contributions are rounded to whole lei; Title IV fixed deductions and income tax use article 66's half-leu-down convention. Changing rounding or applying deductions to fractional earnings requires separate accountant-validated examples.

## Refused or excluded cases

- Other tax years, part-time work, partial months and amounts below the full-time minimum.
- Medical/unpaid/annual leave adjustments, foreign tax/social-security situations, non-cash benefits or vouchers, industry/job-specific conditions, income-tax exemptions, other deductible expenses, garnishments and advances.
- Payroll PDF generation also checks current active employee/contract status, a single overlapping active RON contract covering the whole month, 8-hour schedule and the matching basic salary. Recorded approved leave, absences or active benefits block this standard-case PDF. This is intentionally stricter than the preview calculator.
- No automatic gross-pay proration from attendance, D112 generation, accounting posting or bank execution. Contract history is not reconstructed; historical employment changes require separate handling.

PDFs contain the calculation facts, amounts, period and rule version. They start HR-only; after review HR can make the individual document employee-visible and email it. Regeneration creates a new document; archive superseded copies. No actual salary payment is implied by a document or successful email.

## Primary references

- [ANAF consolidated Fiscal Code](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm): articles 66, 77, 78, 138, 156, 220³ and relevant norms. Despite its historical filename, the page contains consolidated amendments for 2026; recheck before changing periods/rules.
- [HG 146/2026](https://legislatie.just.ro/Public/DetaliiDocument/308231): minimum basic salary from July 2026.
- [OUG 89/2025, article III, consolidated](https://legislatie.just.ro/Public/DetaliiDocument/309360): 2026 allowance, earnings limits, reduction disqualification and partial-period rules.
- [ANAF explanation of the 2026 allowance](https://static.anaf.ro/static/3/Galati/20260123122801_suma%20neimpozabila%20in%202026.pdf).

Next expansion needs confirmed payroll cases and reference outputs: partial-month/leave pay, vouchers/benefits tax treatment, part-time floors and exceptions, annual deduction ceilings, special exemptions, corrections and employer-level reporting. Never silently reuse 2026 rules for a later year.
