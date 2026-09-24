import type { Locale } from "./i18n";

const en = {
  overviewIntro: "Your workplace, requests and employment information.",
  pendingCaption: "Your requests awaiting a decision",
  department: "My department",
  noDepartment: "Your department has not been set yet. Please contact HR.",
  noAccount:
    "Your account is not linked to an employee record. Please contact HR.",
  contracts: "My contracts",
  contractIntro:
    "View your employment contracts. Please contact HR for changes.",
  noContracts:
    "No contracts are available for your account. Please contact HR.",
  leave: "My leave",
  leaveIntro: "Request leave and follow the status of your own requests.",
  attendance: "My attendance",
  attendanceIntro: "Your monthly attendance calendar and recorded hours.",
  attendanceHelp:
    "Completed working days use your contract hours and approved leave automatically. HR can correct the records. Please contact HR if any hours are incorrect.",
  benefits: "My benefits",
  benefitsIntro: "View your benefits and approved monthly amounts.",
  benefitsHelp:
    "Your benefit enrolments are managed by HR. Please contact HR for changes.",
};

const ro: Record<keyof typeof en, string> = {
  overviewIntro:
    "Locul tău de muncă, cererile și informațiile despre angajare.",
  pendingCaption: "Cererile tale care așteaptă o decizie",
  department: "Departamentul meu",
  noDepartment: "Departamentul tău nu a fost încă stabilit. Contactează HR.",
  noAccount: "Contul tău nu este asociat unui angajat. Contactează HR.",
  contracts: "Contractele mele",
  contractIntro:
    "Consultă contractele tale de muncă. Pentru modificări, contactează HR.",
  noContracts:
    "Nu există contracte disponibile pentru contul tău. Contactează HR.",
  leave: "Concediile mele",
  leaveIntro: "Solicită concediu și urmărește starea propriilor cereri.",
  attendance: "Pontajul meu",
  attendanceIntro: "Calendarul lunar al pontajului tău și orele înregistrate.",
  attendanceHelp:
    "Zilele lucrătoare încheiate folosesc automat orele din contract și concediile aprobate. HR poate corecta înregistrările. Contactează HR dacă orele nu sunt corecte.",
  benefits: "Beneficiile mele",
  benefitsIntro: "Consultă beneficiile tale și sumele lunare aprobate.",
  benefitsHelp:
    "Înscrierile tale la beneficii sunt gestionate de HR. Pentru modificări, contactează HR.",
};

export const employeeDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
