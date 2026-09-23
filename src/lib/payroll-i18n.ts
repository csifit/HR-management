import type { Locale } from "./i18n";
import type { PayrollInput, PayrollResult } from "./payroll";
const en = {
  title: "Payroll calculator",
  payslip: "Payslip",
  intro: "Automatic calculation for standard Romanian employment in 2026.",
  month: "Payroll month",
  basic: "Monthly basic gross salary (RON)",
  bonus: "Fully taxable cash bonuses (RON)",
  primary: "Basic employment location",
  dependants: "Eligible dependants (4 = 4 or more)",
  young: "Eligible for the under-26 deduction",
  children: "Eligible school-enrolled children (additional deduction)",
  reduced: "Basic salary reduced since 23 December 2025",
  yes: "Yes",
  no: "No",
  standard:
    "I confirm: Romanian tax resident, normal working conditions, full-time/full month, cash salary only; no medical/unpaid leave, partial month, benefits or vouchers, special exemptions, other deductions, garnishments or advances.",
  scope:
    "Supports 2026 full months, normal conditions and whole-RON earnings. Confirm dependant/child eligibility from supporting documents. Part-time work, benefits, exemptions, leave adjustments, foreign tax rules and D112 filing need separate payroll handling.",
  calculate: "Calculate",
  generate: "Save payslip PDF",
  invalid: "Check the payroll fields and supported-case confirmation.",
  preview: "Calculation preview",
  gross: "Gross earnings",
  relief: "Non-taxable minimum-wage allowance",
  contributionBase: "Contribution base",
  cas: "CAS (25%)",
  cass: "CASS (10%)",
  personalDeduction: "Basic personal deduction",
  youngDeduction: "Additional young-person deduction",
  childrenDeduction: "Additional child deduction",
  taxBase: "Income tax base",
  incomeTax: "Income tax (10%)",
  net: "Net pay",
  cam: "Employer CAM (2.25%, indicative allocation)",
  employerCost: "Employer cost (indicative)",
  footer:
    "Calculated from the entered facts using the stated rule version. Requires payroll review before payment. This document is not proof of payment or a D112 submission.",
  rules: "Tax rule version",
  source: "Rules and supported cases",
  salaryPrivate:
    "Visible only to HR until you change the document's visibility.",
  mismatch:
    "The employee or contract does not match this standard payroll case. Check active status, full-month coverage, 8-hour schedule and salary. Leave, benefits and special cases require separate handling.",
};
const ro: typeof en = {
  title: "Calculator salarial",
  payslip: "Fluturaș de salariu",
  intro:
    "Calcul automat pentru raporturi de muncă standard din România, în 2026.",
  month: "Luna de salarizare",
  basic: "Salariul de bază brut lunar (RON)",
  bonus: "Prime în bani integral impozabile (RON)",
  primary: "Locul funcției de bază",
  dependants: "Persoane eligibile în întreținere (4 = minimum 4)",
  young: "Eligibil pentru deducerea până la 26 de ani",
  children: "Copii eligibili înscriși la școală (deducere suplimentară)",
  reduced: "Salariul de bază a fost diminuat după 23 decembrie 2025",
  yes: "Da",
  no: "Nu",
  standard:
    "Confirm: rezident fiscal român, condiții normale, normă întreagă/lună completă, doar venituri salariale în bani; fără concediu medical/fără plată, lună parțială, beneficii sau tichete, scutiri speciale, alte deduceri, popriri sau avansuri.",
  scope:
    "Acceptă luni complete din 2026, condiții normale și venituri în lei întregi. Verifică eligibilitatea persoanelor/copilului pe baza documentelor. Timpul parțial, beneficiile, scutirile, ajustările de concediu, fiscalitatea internațională și D112 necesită tratare separată.",
  calculate: "Calculează",
  generate: "Salvează fluturașul PDF",
  invalid: "Verifică datele salariale și confirmarea cazului acceptat.",
  preview: "Previzualizarea calculului",
  gross: "Venit brut",
  relief: "Sumă neimpozabilă la salariul minim",
  contributionBase: "Bază contribuții",
  cas: "CAS (25%)",
  cass: "CASS (10%)",
  personalDeduction: "Deducere personală de bază",
  youngDeduction: "Deducere suplimentară pentru tineri",
  childrenDeduction: "Deducere suplimentară pentru copii",
  taxBase: "Bază impozit pe venit",
  incomeTax: "Impozit pe venit (10%)",
  net: "Salariu net",
  cam: "CAM angajator (2,25%, alocare orientativă)",
  employerCost: "Cost angajator (orientativ)",
  footer:
    "Calculat din datele introduse, cu versiunea regulilor indicată. Necesită verificare salarială înaintea plății. Nu confirmă efectuarea plății și nu reprezintă depunerea D112.",
  rules: "Versiunea regulilor fiscale",
  source: "Reguli și cazuri acceptate",
  salaryPrivate:
    "Vizibil doar pentru HR până la modificarea vizibilității documentului.",
  mismatch:
    "Angajatul sau contractul nu corespunde cazului standard. Verifică starea activă, luna completă, programul de 8 ore și salariul. Concediile, beneficiile și cazurile speciale necesită tratare separată.",
};
export function payrollDictionary(locale: Locale) {
  return locale === "ro" ? ro : en;
}
export const payrollRows = [
  "gross",
  "relief",
  "contributionBase",
  "cas",
  "cass",
  "personalDeduction",
  "youngDeduction",
  "childrenDeduction",
  "taxBase",
  "incomeTax",
  "net",
  "cam",
  "employerCost",
] as const;
export function payslipBody(
  v: PayrollInput,
  result: PayrollResult,
  locale: Locale,
) {
  const d = payrollDictionary(locale);
  const money = new Intl.NumberFormat(locale === "ro" ? "ro-RO" : "en-GB", {
    style: "currency",
    currency: "RON",
  });
  return [
    `${d.month}: ${v.month}`,
    `${d.basic}: ${money.format(v.basic)}; ${d.bonus}: ${money.format(v.bonus)}`,
    `${d.primary}: ${v.primary === "yes" ? d.yes : d.no}; ${d.young}: ${v.young === "yes" ? d.yes : d.no}`,
    `${d.dependants}: ${v.dependants}; ${d.children}: ${v.children}`,
    `${d.reduced}: ${v.reduced === "yes" ? d.yes : d.no}`,
    "",
    ...payrollRows.map((k) => `${d[k]}: ${money.format(result[k])}`),
    "",
    `${d.rules}: ${result.rules}`,
    d.footer,
  ].join("\n");
}
