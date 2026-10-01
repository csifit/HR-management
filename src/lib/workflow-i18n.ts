import type { Locale } from "./i18n";

const en = {
  contractFacts: "Contract and employment period",
  earnings: "Earnings and amounts already paid",
  deductions: "Tax declarations and deductions",
  review: "Review before calculation",
  guidance: "Calculation scope and evidence guidance",
  breakdown: "Full tax and contribution breakdown",
  absenceTotals: "Leave and absence days",
  relatedRecords: "Related records",
  chooseOrganisation: "Switch organisation",
  security: "Account security",
  beforePreview:
    "Complete the declarations and review confirmations, then calculate to enable saving.",
  afterPreview:
    "Preview ready. Check the figures, then save this employee's calculation.",
};
const ro: typeof en = {
  contractFacts: "Contract și perioadă de angajare",
  earnings: "Venituri și sume deja plătite",
  deductions: "Declarații fiscale și deduceri",
  review: "Verificare înainte de calcul",
  guidance: "Cazuri acceptate și documente justificative",
  breakdown: "Detalierea taxelor și contribuțiilor",
  absenceTotals: "Zile de concediu și absență",
  relatedRecords: "Înregistrări asociate",
  chooseOrganisation: "Schimbă organizația",
  security: "Securitatea contului",
  beforePreview:
    "Completează declarațiile și confirmările, apoi calculează pentru a putea salva.",
  afterPreview:
    "Previzualizarea este gata. Verifică sumele, apoi salvează calculul angajatului.",
};
export const workflowDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
