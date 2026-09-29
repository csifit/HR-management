import type { Locale } from "./i18n";

const en = {
  title: "Monthly payroll",
  intro:
    "Prepare employee calculations, review the included employees and approve a locked monthly revision.",
  newRun: "Create monthly draft",
  month: "Payroll month",
  revision: "Revision",
  status: "Status",
  draft: "Draft",
  approved: "Approved · locked",
  discarded: "Discarded",
  created: "Created",
  approvedOn: "Approved",
  details: "Open payroll",
  empty: "No monthly payroll runs yet.",
  previous: "Previous",
  next: "Next",
  filter: "Apply filter",
  allMonths: "Clear filter",
  back: "All payroll runs",
  save: "Save employee calculation",
  savedHelp:
    "Saving adds this employee to the draft. Payslips become available after HR approval.",
  included: "Included employees",
  scope:
    "This revision covers only the employees listed below. Employees with unsupported payroll cases must be handled separately. Approval does not confirm a payment or file a declaration.",
  emptyItems: "Choose an employee and save a calculation to begin.",
  employee: "Employee",
  edit: "Review calculation",
  remove: "Remove from draft",
  removeHelp: "The removed calculation remains in this run’s history.",
  totals: "Totals for included employees",
  count: "Employees included",
  approve: "Approve and lock revision",
  approveConfirm:
    "I reviewed every included employee, the totals and supporting evidence. I approve these calculations for the stated month and understand this revision will be locked.",
  approvedHelp:
    "These saved calculations are locked. A correction creates another revision and preserves this approval and its payslips.",
  discard: "Discard draft",
  discardHelp:
    "Discards this draft and preserves its calculations and history. Approved revisions are unaffected.",
  reason: "Reason",
  correction: "Create correction draft",
  correctionHelp:
    "Copy this approved revision into a new draft with a reason. Review its calculations and refresh any changed source data before approval. Existing PDFs are not recalled.",
  previousRevision: "Previous approved revision",
  newerRevision: "A newer approved revision is available",
  snapshot: "Saved calculation",
  savedOn: "Saved",
  inputs: "Saved inputs",
  history: "Change and approval history",
  historyHelp:
    "History contains sensitive payroll information and is available only to HR and the organisation owner.",
  noHistory: "No history yet.",
  eventDetails: "View recorded details",
  actor: "Actor",
  unavailableActor: "Former or unavailable member",
  action: "Action",
  at: "Date and time",
  document: "Create approved payslip PDF",
  documents: "Employee documents",
  linkedPdfs: "Payslip records",
  pendingPdf: "Not completed",
  readyPdf: "Ready in Documents",
  hoursScope:
    "Manual reduced or extra hours require separate payroll handling. This calculator does not prorate gross salary from attendance.",
  pdfHelp:
    "The PDF uses this approved snapshot. It is private to HR until its visibility is changed in Documents. Sending is a separate action.",
  inactive:
    "This organisation is read-only. Payroll and history remain available.",
  busy: "Saving…",
  sourceHelp:
    "Saving checks the current contract, schedule, attendance and benefits confirmation. If source data changes before approval, review and save the affected calculations again.",
  payrollScope:
    "The calculator’s supported cases are unchanged. Approval is an internal HR review, not independent validation of the tax rules.",
  invalid: "Check the form fields and required confirmations.",
  error: "Payroll could not be saved. Try again.",
  stale:
    "This payroll run changed. Reload it and review the latest version before trying again.",
  locked: "This revision is locked or the organisation is read-only.",
  sourceChanged:
    "An employee’s source data changed or is outside the supported cases. Review the contract, schedule, attendance and benefits, then save the affected calculation again.",
  closedMonthOnly:
    "Approval is available after the payroll month has ended in Romania. You can prepare the draft meanwhile.",
  duplicate:
    "A draft or newer revision already exists for this month. Open it from the monthly payroll list.",
  saved: "Payroll updated.",
  pdfSaved: "Approved payslip saved in employee documents.",
  pdfFailed:
    "The payslip PDF could not be completed. Check Documents before trying again.",
  limitReached: "This payroll run supports at most 200 employees.",
};

const ro: typeof en = {
  title: "Salarizare lunară",
  intro:
    "Pregătește calculele individuale, verifică angajații incluși și aprobă o revizie lunară blocată.",
  newRun: "Creează ciornă lunară",
  month: "Luna de salarizare",
  revision: "Revizie",
  status: "Stare",
  draft: "Ciornă",
  approved: "Aprobată · blocată",
  discarded: "Abandonată",
  created: "Creată",
  approvedOn: "Aprobată",
  details: "Deschide salarizarea",
  empty: "Nu există încă state lunare de salarizare.",
  previous: "Înapoi",
  next: "Înainte",
  filter: "Aplică filtrul",
  allMonths: "Șterge filtrul",
  back: "Toate statele de salarizare",
  save: "Salvează calculul angajatului",
  savedHelp:
    "Salvarea adaugă angajatul în ciornă. Fluturașii sunt disponibili după aprobarea HR.",
  included: "Angajați incluși",
  scope:
    "Această revizie acoperă doar angajații de mai jos. Cazurile de salarizare neacceptate de calculator se gestionează separat. Aprobarea nu confirmă o plată și nu depune o declarație.",
  emptyItems: "Alege un angajat și salvează un calcul pentru a începe.",
  employee: "Angajat",
  edit: "Verifică calculul",
  remove: "Elimină din ciornă",
  removeHelp: "Calculul eliminat rămâne în istoricul acestui stat.",
  totals: "Totaluri pentru angajații incluși",
  count: "Angajați incluși",
  approve: "Aprobă și blochează revizia",
  approveConfirm:
    "Am verificat fiecare angajat inclus, totalurile și documentele justificative. Aprob calculele pentru luna indicată și înțeleg că revizia va fi blocată.",
  approvedHelp:
    "Calculele salvate sunt blocate. O corecție creează altă revizie și păstrează această aprobare și fluturașii săi.",
  discard: "Abandonează ciorna",
  discardHelp:
    "Abandonează această ciornă, păstrând calculele și istoricul. Reviziile aprobate nu sunt afectate.",
  reason: "Motiv",
  correction: "Creează ciornă de corecție",
  correctionHelp:
    "Copiază această revizie aprobată într-o ciornă nouă, cu un motiv. Verifică toate calculele și actualizează datele sursă modificate înainte de aprobare. PDF-urile existente nu sunt retrase.",
  previousRevision: "Revizia aprobată precedentă",
  newerRevision: "Este disponibilă o revizie aprobată mai nouă",
  snapshot: "Calcul salvat",
  savedOn: "Salvat",
  inputs: "Date de intrare salvate",
  history: "Istoric modificări și aprobări",
  historyHelp:
    "Istoricul conține informații salariale sensibile, disponibile doar HR-ului și proprietarului organizației.",
  noHistory: "Nu există încă istoric.",
  eventDetails: "Vezi detaliile înregistrate",
  actor: "Autor",
  unavailableActor: "Fost membru sau membru indisponibil",
  action: "Acțiune",
  at: "Data și ora",
  document: "Creează PDF-ul fluturașului aprobat",
  documents: "Documentele angajatului",
  linkedPdfs: "Înregistrări de fluturași",
  pendingPdf: "Nefinalizat",
  readyPdf: "Disponibil în Documente",
  hoursScope:
    "Orele reduse sau suplimentare introduse manual necesită tratare salarială separată. Calculatorul nu proratează salariul brut după pontaj.",
  pdfHelp:
    "PDF-ul folosește calculul aprobat. Rămâne vizibil doar HR-ului până la schimbarea vizibilității în Documente. Trimiterea este o acțiune separată.",
  inactive:
    "Organizația este în mod de citire. Salarizarea și istoricul rămân disponibile.",
  busy: "Se salvează…",
  sourceHelp:
    "Salvarea verifică datele actuale despre contract, program, pontaj și confirmarea beneficiilor. Dacă acestea se schimbă înainte de aprobare, verifică și salvează din nou calculele afectate.",
  payrollScope:
    "Cazurile acceptate de calculator rămân neschimbate. Aprobarea este o verificare internă HR, nu o validare independentă a regulilor fiscale.",
  invalid: "Verifică datele introduse și confirmările obligatorii.",
  error: "Nu am putut salva salarizarea. Încearcă din nou.",
  stale:
    "Statul de salarizare s-a schimbat. Reîncarcă pagina și verifică ultima versiune înainte de a încerca din nou.",
  locked: "Revizia este blocată sau organizația este în mod de citire.",
  sourceChanged:
    "Datele sursă ale unui angajat s-au schimbat sau cazul nu este acceptat. Verifică contractul, programul, pontajul și beneficiile, apoi salvează din nou calculul afectat.",
  closedMonthOnly:
    "Aprobarea este disponibilă după încheierea lunii de salarizare în România. Între timp poți pregăti ciorna.",
  duplicate:
    "Există deja o ciornă sau o revizie mai nouă pentru această lună. Deschide-o din lista de salarizare lunară.",
  saved: "Salarizarea a fost actualizată.",
  pdfSaved: "Fluturașul aprobat a fost salvat în documentele angajatului.",
  pdfFailed:
    "Nu am putut finaliza PDF-ul. Verifică Documente înainte de a încerca din nou.",
  limitReached: "Un stat de salarizare poate include cel mult 200 de angajați.",
};

export const payrollRunDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;

export function payrollEventLabel(action: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    created: ["Ciornă creată", "Draft created"],
    corrected: ["Ciornă de corecție creată", "Correction draft created"],
    item_saved: ["Calcul salvat", "Calculation saved"],
    item_copied: [
      "Calcul copiat în corecție",
      "Calculation copied to correction",
    ],
    item_removed: [
      "Calcul eliminat din ciornă",
      "Calculation removed from draft",
    ],
    approved: ["Revizie aprobată", "Revision approved"],
    discarded: ["Ciornă abandonată", "Draft discarded"],
    document_prepared: ["Fluturaș pregătit", "Payslip prepared"],
  };
  return labels[action]?.[locale === "ro" ? 0 : 1] ?? action;
}
