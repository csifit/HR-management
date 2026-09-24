import type { Locale } from "./i18n";
import type { PayrollInput, PayrollResult } from "./payroll";
const en = {
  title: "Payroll calculator",
  payslip: "Payslip",
  intro: "Automatic calculation for standard Romanian employment in 2026.",
  month: "Payroll month",
  basic: "Monthly basic gross salary (RON)",
  bonus: "Fully taxable cash bonuses (RON)",
  hours: "Contractual hours per working day (normal full time = 8)",
  meals: "Meal vouchers actually issued (RON, non-cash)",
  advance: "Salary advance already paid (RON)",
  floorException: "Part-time contribution-floor exception",
  evidence: "Evidence reference for the floor exception",
  mealsReference: "Meal-voucher issuance reference",
  advanceReference: "Advance payment reference",
  referencesHelp:
    "Use short internal references only, without diagnoses or other people's identifiers. Confirm voucher eligibility, limits and actual issuance. An approved benefit budget is not proof of issuance.",
  benefitsReview:
    "I reviewed the benefit register and issuance evidence: all benefits relevant to this payroll are the meal vouchers entered here. No other taxable benefits are omitted.",
  floorHelp:
    "An exception requires valid evidence for this month. It only removes the employer-funded contribution top-up; it does not grant an income-tax exemption. Multiple-contract eligibility is not inferred from this organisation's records.",
  primary: "Basic employment location",
  dependants: "Eligible dependants (4 = 4 or more)",
  young: "Eligible for the under-26 deduction",
  children: "Eligible school-enrolled children (additional deduction)",
  reduced: "Basic salary reduced since 23 December 2025",
  yes: "Yes",
  no: "No",
  standard:
    "I confirm: Romanian tax resident, normal working conditions and a full month on the entered schedule; cash salary and legally issued meal vouchers only. No leave adjustments, partial month, other benefits, income-tax exemptions, other deductions or garnishments. The entered advance was already paid for this payroll month.",
  scope:
    "Supports full months in 2026, normal conditions and RON amounts with up to two decimal places. Part-time CAS/CASS top-ups are paid by the employer. Meal vouchers are separate from cash pay; advances reduce the remaining payment, not taxes. Partial months, leave adjustments, other benefits and D112 need separate handling.",
  calculate: "Calculate",
  generate: "Save payslip PDF",
  invalid: "Check the payroll fields and supported-case confirmation.",
  preview: "Calculation preview",
  gross: "Total gross earnings including meal vouchers",
  cashGross: "Gross cash earnings",
  relief: "Non-taxable minimum-wage allowance",
  contributionBase: "CAS / CAM base (cash)",
  healthBase: "CASS base including meal vouchers",
  cas: "CAS (25%)",
  cass: "CASS (10%)",
  personalDeduction: "Basic personal deduction",
  youngDeduction: "Additional young-person deduction",
  childrenDeduction: "Additional child deduction",
  taxBaseBeforeRounding: "Taxable income before rounding",
  taxBase: "Income tax base (rounded)",
  incomeTax: "Income tax (10%)",
  net: "Net cash salary before advance",
  payable: "Cash remaining to pay",
  contributionFloor: "Minimum CAS / CASS base",
  employerCas: "CAS top-up paid by employer",
  employerCass: "CASS top-up paid by employer",
  cam: "Employer CAM (2.25%, indicative allocation)",
  employerCost: "Employer cost (indicative)",
  footer:
    "Calculated from the entered facts using the stated rule version. Requires payroll review before payment. This document is not proof of payment or a D112 submission.",
  rules: "Tax rule version",
  source: "Rules and supported cases",
  salaryPrivate:
    "Visible only to HR until you change the document's visibility.",
  mismatch:
    "Check active status, full-month contract coverage, matching hours/salary and the benefits review. Leave, partial months and unsupported benefits need separate handling.",
};
const ro: typeof en = {
  title: "Calculator salarial",
  payslip: "Fluturaș de salariu",
  intro:
    "Calcul automat pentru raporturi de muncă standard din România, în 2026.",
  month: "Luna de salarizare",
  basic: "Salariul de bază brut lunar (RON)",
  bonus: "Prime în bani integral impozabile (RON)",
  hours: "Ore contractuale pe zi lucrătoare (normă normală întreagă = 8)",
  meals: "Tichete de masă efectiv acordate (RON, fără numerar)",
  advance: "Avans salarial deja plătit (RON)",
  floorException: "Excepție de la plafonul contribuțiilor pentru timp parțial",
  evidence: "Referința dovezii pentru excepția de la plafon",
  mealsReference: "Referința acordării tichetelor de masă",
  advanceReference: "Referința plății avansului",
  referencesHelp:
    "Folosește referințe interne scurte, fără diagnostice sau identificatori ai altor persoane. Verifică eligibilitatea, limitele și acordarea efectivă a tichetelor. Un buget de beneficii aprobat nu dovedește acordarea.",
  benefitsReview:
    "Am verificat registrul de beneficii și dovezile acordării: toate beneficiile relevante pentru acest calcul sunt tichetele de masă introduse aici. Nu sunt omise alte beneficii impozabile.",
  floorHelp:
    "Excepția necesită dovezi valabile pentru luna calculată. Elimină doar diferența de contribuții suportată de angajator, nu acordă scutire de impozit. Eligibilitatea pentru cumul de contracte nu este dedusă din evidențele acestei organizații.",
  primary: "Locul funcției de bază",
  dependants: "Persoane eligibile în întreținere (4 = minimum 4)",
  young: "Eligibil pentru deducerea până la 26 de ani",
  children: "Copii eligibili înscriși la școală (deducere suplimentară)",
  reduced: "Salariul de bază a fost diminuat după 23 decembrie 2025",
  yes: "Da",
  no: "Nu",
  standard:
    "Confirm: rezident fiscal român, condiții normale și lună completă cu programul introdus; doar salariu în bani și tichete de masă acordate legal. Fără ajustări de concediu, lună parțială, alte beneficii, scutiri de impozit, alte deduceri sau popriri. Avansul introdus a fost deja plătit pentru această lună salarială.",
  scope:
    "Acceptă luni complete din 2026, condiții normale și sume în lei și bani, cu maximum două zecimale. Diferențele CAS/CASS pentru timp parțial sunt suportate de angajator. Tichetele se separă de salariul în bani; avansul reduce restul de plată, nu taxele. Lunile parțiale, concediile, alte beneficii și D112 necesită tratare separată.",
  calculate: "Calculează",
  generate: "Salvează fluturașul PDF",
  invalid: "Verifică datele salariale și confirmarea cazului acceptat.",
  preview: "Previzualizarea calculului",
  gross: "Venit brut total, inclusiv tichete",
  cashGross: "Venit brut în bani",
  relief: "Sumă neimpozabilă la salariul minim",
  contributionBase: "Bază CAS / CAM (salariu în bani)",
  healthBase: "Bază CASS, inclusiv tichete",
  cas: "CAS (25%)",
  cass: "CASS (10%)",
  personalDeduction: "Deducere personală de bază",
  youngDeduction: "Deducere suplimentară pentru tineri",
  childrenDeduction: "Deducere suplimentară pentru copii",
  taxBaseBeforeRounding: "Venit impozabil înainte de rotunjire",
  taxBase: "Bază impozit pe venit (rotunjită)",
  incomeTax: "Impozit pe venit (10%)",
  net: "Salariu net în bani, înainte de avans",
  payable: "Rest de plată în bani",
  contributionFloor: "Bază minimă CAS / CASS",
  employerCas: "Diferență CAS suportată de angajator",
  employerCass: "Diferență CASS suportată de angajator",
  cam: "CAM angajator (2,25%, alocare orientativă)",
  employerCost: "Cost angajator (orientativ)",
  footer:
    "Calculat din datele introduse, cu versiunea regulilor indicată. Necesită verificare salarială înaintea plății. Nu confirmă efectuarea plății și nu reprezintă depunerea D112.",
  rules: "Versiunea regulilor fiscale",
  source: "Reguli și cazuri acceptate",
  salaryPrivate:
    "Vizibil doar pentru HR până la modificarea vizibilității documentului.",
  mismatch:
    "Verifică starea activă, contractul pentru luna completă, orele/salariul și confirmarea beneficiilor. Concediile, lunile parțiale și beneficiile neacceptate necesită tratare separată.",
};
export function payrollDictionary(locale: Locale) {
  return locale === "ro" ? ro : en;
}
export const payrollRows = [
  "gross",
  "cashGross",
  "meals",
  "relief",
  "contributionBase",
  "healthBase",
  "cas",
  "cass",
  "personalDeduction",
  "youngDeduction",
  "childrenDeduction",
  "taxBaseBeforeRounding",
  "taxBase",
  "incomeTax",
  "net",
  "advance",
  "payable",
  "contributionFloor",
  "employerCas",
  "employerCass",
  "cam",
  "employerCost",
] as const;
export function floorExceptionLabels(locale: Locale) {
  return locale === "ro"
    ? {
        none: "Nicio excepție / plafon aplicabil",
        student: "Elev/student până la 26 de ani, în școlarizare",
        apprentice: "Ucenic până la 18 ani",
        reduced_hours: "Drept legal documentat la program sub 8 ore",
        retired: "Pensionar eligibil pentru limită de vârstă",
        multiple_contracts:
          "Cumul de contracte cu bază cel puțin egală cu minimul",
      }
    : {
        none: "No exception / floor applies",
        student: "Student up to age 26 in education",
        apprentice: "Apprentice up to age 18",
        reduced_hours: "Documented statutory right to work under 8 hours",
        retired: "Eligible public old-age pensioner",
        multiple_contracts:
          "Multiple contracts meeting the aggregate minimum base",
      };
}
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
  const ro = locale === "ro";
  const rows = payrollRows.filter((k) => {
    if (k === "taxBaseBeforeRounding")
      return result.taxBaseBeforeRounding !== result.taxBase;
    if (["cashGross", "meals", "healthBase"].includes(k))
      return result.meals > 0;
    if (["advance", "payable"].includes(k)) return result.advance > 0;
    if (k === "contributionFloor") return v.hours < 8;
    if (k === "employerCas" || k === "employerCass") return result[k] > 0;
    return true;
  });
  return [
    `${d.month}: ${v.month} | ${ro ? "Ore/zi" : "Hours/day"}: ${v.hours}`,
    `${ro ? "Bază brută / prime" : "Basic gross / bonuses"}: ${money.format(v.basic)} / ${money.format(v.bonus)}`,
    `${ro ? "Funcție de bază / deducere tineri" : "Primary employment / young-person deduction"}: ${v.primary === "yes" ? d.yes : d.no} / ${v.young === "yes" ? d.yes : d.no}`,
    `${ro ? "Persoane în întreținere / copii eligibili" : "Dependants / eligible children"}: ${v.dependants} / ${v.children}`,
    `${ro ? "Diminuare salariu după 23.12.2025" : "Basic-pay reduction since 23.12.2025"}: ${v.reduced === "yes" ? d.yes : d.no}`,
    ...(v.hours < 8
      ? [
          `${d.floorException}: ${floorExceptionLabels(locale)[v.floorException]}`,
        ]
      : []),
    ...(v.evidence ? [`${d.evidence}: ${v.evidence}`] : []),
    ...(v.meals > 0 ? [`${d.mealsReference}: ${v.mealsReference}`] : []),
    ...(v.advance > 0 ? [`${d.advanceReference}: ${v.advanceReference}`] : []),
    "",
    ...rows.map((k) => `${d[k]}: ${money.format(result[k])}`),
    "",
    `${d.rules}: ${result.rules}`,
    d.footer,
  ].join("\n");
}
