# Romanian payroll: simple partial months in 2026

Primary sources reviewed on **1 October 2026**. This extends the bounded cases in [payroll-rules.md](payroll-rules.md); it is not an independent accountant approval or a D112 implementation.

## Supported scope and calculation conventions

`RO-2026-monthly-v4` supports one unchanged RON contract with a uniform Monday–Friday schedule, starting or ending within the payroll month. The saved employment interval, monthly working-day count and active working-day count come from the checked contract/calendar source. Contract salary and hours remain monthly contractual values. No leave, absences, overtime, schedule changes, overlapping contracts or historical contract reconstruction are inferred.

Earned basic pay is `monthly contractual basic pay × active working days / month working days`, rounded once to bani, with an exact half-ban rounded upward. This is the application's explicit convention for the supported uniform schedule, not a verbatim statutory formula. Cash bonuses are actual amounts for the month and are not prorated. Actual issued meal vouchers and already-paid advances retain the existing evidence requirements.

[Labour Code articles 159–160](https://legislatie.just.ro/Public/FormaPrintabila/00000G0SFXM9YDHHPCT0AYNE6UN3FDIM) establish pay for work and monthly basic remuneration. They do not supply a universal partial-month salary formula or an explicit half-ban rounding rule. Independent accountant validation of this convention and representative results remains outstanding.

## Contribution floor: confirmed working days and integer rounding

Fiscal Code article 146(5^6), with article 168(6^1), ties the minimum contribution base to the working days during which the contract was active. OUG 89/2025 article III(5) reduces the monthly reference minimum by 300 lei in January–June and 200 lei in July–December. The resulting full-month reference is 3,750 or 4,125 lei. Do not scale this contribution floor again by part-time contractual hours.

For the supported case, v4 first rounds `(monthly minimum − monthly reduction) × active working days / month working days` to **whole lei, half up**, then calculates and rounds the floor contributions. Employer top-ups are the nonnegative differences from employee CAS/CASS, and never reduce employee net pay. Evidenced statutory exceptions retain the existing treatment.

This intermediate whole-leu rounding is supported by the [latest ANAF D112 validation annex, updated 7 September 2026](https://static.anaf.ro/static/10/Anaf/Declaratii_R/AplicatiiDec/structura_D112_0726_070926.pdf): printed page 3 provides the 2026 constants and working-day ratios; page 6 describes arithmetic rounding; pages 39–40 and 49–50 show the floor followed by the contribution calculations. The floor formula is `part_time = ROUND(sm * activeDays / NZL)` (the source uses `A_8` or `zile_PT` for active days). Some detailed rows retain older 4,050/300 constants; use the current 2026 introduction for the applicable amounts. The [D112 instructions](https://static.anaf.ro/static/10/Anaf/legislatie/OPANAF_605_2026.pdf), printed pages 58–59, separately confirm the active-working-day rule.

For example, July 1–22 has 16 of July's 23 working days. A four-hour contract at 2,162.50 lei earns 1,504.35 lei. The floor is 2,870 lei after rounding, producing floor CAS of 718 lei. Applying CAS before rounding the 2,869.565... lei floor would instead produce 717 lei and is not this v4 convention.

## Personal deductions and evidence

Personal deductions are monthly amounts based on actual monthly gross, without day proration, capped by the available taxable income. They require primary employment. [ANAF's starter example](https://static.anaf.ro/static/10/Anaf/AsistentaContribuabili_r/Facebook/FB_28_06_2017.pdf), questions 1–2, confirms a full deduction for a mid-month starter and the first-employer restriction. Its historical deduction amounts are not reused.

The current [Fiscal Code and norms](https://static.anaf.ro/static/10/Anaf/legislatie/Cod_fiscal_norme_2023.htm), Title IV norm 16(4), restrict the deduction to the first employer when employment changes within a month. Article 77(2) defines personal deduction to include basic and supplementary deductions. Applying the first-employer rule to young-person and school-child deductions is a combined reading of those provisions; no explicit official example addressing these newer supplementary deductions was found. Article 77(13) also requires the relevant multi-employer parent's declaration that the child deduction is not received elsewhere.

HR must explicitly record whether this employer may grant the monthly deductions and an evidence reference for primary-employment partial months. This must establish first-employer status or another supported factual basis; it cannot be inferred from this organisation's employee list. If an earlier employer is entitled to the month's deduction, all three personal-deduction components are zero here. Primary employment is a separate declaration under article 7(2); do not turn it off merely to suppress the deduction.

## Minimum-wage relief remains excluded for partial-month candidates

[OUG 89/2025 article III](https://legislatie.just.ro/Public/DetaliiDocument/309360) and [ANAF's 2026 explanation](https://static.anaf.ro/static/3/Galati/20260123122801_suma%20neimpozabila%20in%202026.pdf) require reduction of the 300/200 lei relief for starters, leavers and fractions of a month. The official [Senate explanatory memorandum](https://www.senat.ro/Legis/PDF/2025/25L645EM.pdf?nocache=true), printed page 36, expressly describes active working days divided by monthly working days. This explains the ordinance; it is not itself the enacted provision.

The ordinance tests actual qualifying monthly gross against 4,300/4,600 lei. Its proration provision reduces the relief amount only, not those caps. Leaving the caps unchanged follows the text; no explicit official partial-month cap example was found. Meal vouchers, holiday vouchers and lawful food allowance do not consume these caps.

**The exact rounding of prorated relief before calculating tax/contribution bases remains unverified.** The D112 annex and [XSD](https://static.anaf.ro/static/10/Anaf/Declaratii_R/AplicatiiDec/d112_0726_140826.xsd) require integer reporting of the relief field, but do not supply an explicit pre-tax prorated-relief rounding formula. Integer reporting alone does not settle payroll calculation precision.

Accordingly, a partial-month full-time primary-employment contract at the exact minimum, with no disqualifying reduction and earnings within the cap, is blocked for separate accountant review. The application does not silently set relief to zero or choose a rounding method. Full-month relief and partial-month contracts which fail an independently established relief condition retain their supported treatment.

## Existing records and validation

Inputs without period metadata continue to use v3; existing approved results and PDFs keep their saved version and figures. Full-month v4 amounts should match v3. New period metadata is validated for dates, month consistency, positive counts and internally consistent calendar/working-day bounds; source checks remain responsible for the actual contract and calendar facts.

Regression cases cover starter/leaver calculations, the fractional part-time minimum, floor rounding before contributions, first-employer evidence, deduction caps, bonuses, advances, impossible periods and the relief-review block. These are implementation checks. Independent accountant/SAGA comparison remains required before treating the new partial-month results as externally validated.
