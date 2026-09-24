import type { Locale } from "./i18n";
const en = {
  title: "Work schedules",
  intro:
    "Set recurring working weekdays for the organisation or an individual employee.",
  organisation: "Organisation schedule",
  employee: "Employee schedule",
  help: "The default is Monday–Friday. An employee override replaces the organisation weekdays. Company calendar date exceptions take precedence over both. Daily hours still come from the contract.",
  effectiveHelp:
    "Changes start today or later and continue until the next scheduled change. Earlier dates and saved attendance corrections stay unchanged. If a change affects pending or approved leave, cancel and resubmit that leave first.",
  from: "Effective from",
  weekdays: "Working weekdays",
  mode: "Schedule source",
  inherit: "Follow organisation schedule",
  custom: "Choose weekdays",
  add: "Schedule a change",
  current: "Today's schedule",
  history: "Scheduled changes and history",
  none: "No schedule changes yet.",
  days: "days per week",
  past: "Historical schedule · read only",
  invalidDate:
    "Choose today or a later date. Earlier schedules cannot be changed.",
  payroll:
    "The current payroll calculator supports Monday–Friday schedules only. Other schedules require payroll review.",
};
const ro: Record<keyof typeof en, string> = {
  title: "Programe de lucru",
  intro:
    "Stabilește zilele lucrătoare recurente pentru organizație sau pentru un angajat.",
  organisation: "Programul organizației",
  employee: "Programul angajatului",
  help: "Implicit, se lucrează de luni până vineri. Programul individual înlocuiește zilele organizației. Excepțiile pentru date specifice din calendarul organizației au prioritate față de ambele. Orele zilnice provin în continuare din contract.",
  effectiveHelp:
    "Modificările încep astăzi sau ulterior și se aplică până la următoarea schimbare programată. Datele anterioare și corecțiile salvate în pontaj rămân neschimbate. Dacă modificarea afectează concedii în așteptare sau aprobate, anulează și retrimite mai întâi acele cereri.",
  from: "Se aplică din",
  weekdays: "Zile lucrătoare",
  mode: "Sursa programului",
  inherit: "Urmează programul organizației",
  custom: "Alege zilele",
  add: "Programează o modificare",
  current: "Programul de astăzi",
  history: "Modificări programate și istoric",
  none: "Nu există încă modificări de program.",
  days: "zile pe săptămână",
  past: "Program istoric · doar consultare",
  invalidDate:
    "Alege data de astăzi sau o dată ulterioară. Programele anterioare nu pot fi modificate.",
  payroll:
    "Calculatorul salarial actual acceptă doar programe de luni până vineri. Alte programe necesită verificare salarială.",
};
export const scheduleDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
export function weekdayLabels(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(
    locale === "ro" ? "ro-RO" : "en-GB",
    { weekday: "long", timeZone: "UTC" },
  );
  return Array.from({ length: 7 }, (_, i) =>
    formatter.format(new Date(Date.UTC(2024, 0, i + 1))),
  );
}
