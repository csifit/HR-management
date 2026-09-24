import type { Locale } from "./i18n";
const en = {
  title: "Privacy requests",
  intro:
    "Restricted HR register for employee requests and reviewed data exports.",
  newRequest: "Record request",
  employee: "Employee",
  search: "Find employee",
  searchHelp: "Search by name to narrow the employee list (up to 40 matches).",
  kind: "Request type",
  access: "Access",
  rectification: "Correction",
  erasure: "Erasure",
  restriction: "Restriction",
  portability: "Portability",
  objection: "Objection",
  received: "Received",
  in_review: "In review",
  completed: "Completed",
  refused: "Refused",
  withdrawn: "Withdrawn",
  channel: "Received through",
  email: "Email",
  in_person: "In person",
  post: "Post",
  other: "Other",
  receivedOn: "Received on",
  initialDue: "Initial deadline",
  due: "Response deadline",
  assignee: "Responsible HR person",
  summary: "Request scope / reference",
  state: "Status",
  save: "Save",
  busy: "Working…",
  saved: "Request updated.",
  error: "Could not complete this action. Check your access and try again.",
  invalid: "Check the fields, dates, responsible person and required evidence.",
  stale:
    "This request or a selected document changed. Refresh before continuing.",
  locked:
    "Export requires an access/portability request in review and verified identity. Closed requests cannot be edited.",
  inactive:
    "This organisation is read-only. Changes and exports are unavailable.",
  identity: "Identity / authority verification reference",
  identityHelp:
    "Enter a short reference only after verifying the requester and any representative's authority. Leave empty until verified. Do not store identity-document copies here.",
  extension: "Extension reason",
  notified: "Extension actually notified on",
  deadlineHelp:
    "The suggested deadline is one calendar month after receipt. HR must check applicable calendar rules. An extension needs a reason and the actual notice date; dates do not send notifications.",
  lateNotice:
    "Extension notice was recorded after the initial deadline. Review and escalate this case.",
  response: "Secure response / withdrawal evidence reference",
  responded: "Response / withdrawal date",
  resolution: "Outcome, retained data or refusal reasons",
  closeHelp:
    "To close, record the response or withdrawal evidence, date and outcome. Completed requests require identity verification. Erasure/restriction/correction decisions must be carried out separately; closing a case changes no HR records.",
  notesHelp:
    "Use minimal internal references. Avoid diagnoses, passwords, full identity documents and information about other people.",
  history: "Request history",
  exports: "Prepared exports (latest 20)",
  empty: "No requests found.",
  all: "All",
  open: "Open",
  overdue: "Overdue",
  previous: "Previous",
  next: "Next",
  back: "Back to requests",
  details: "Open request",
  version: "Version",
  noHistory: "No exports prepared.",
  exportTitle: "Prepare employee review package",
  from: "Calculated attendance from",
  to: "Calculated attendance to",
  exportHelp:
    "The stored HR data listed below are included; calculated attendance is limited to the selected period (up to 366 days). Select reviewed PDF copies below, including archived files when appropriate. Up to 50 files / 50 MB per package. Records above 2 MB need an assisted export. This package is for HR review, not automatic delivery.",
  coverage:
    "Includes profile, contracts, leave, recorded attendance, schedules, benefits, lifecycle notes, document inventory, delivery metadata, invitations and this organisation's account membership. Audit/support/Auth-provider data and third-party copies need separate review. Review free text, third-party details and Article 15 information before responding.",
  confirm:
    "I verified identity/authority and the scope. I will review the records and selected files for other people's information before delivering a response securely.",
  download: "Download review ZIP",
  downloaded:
    "Review package prepared. Verify the download, review its contents and record the actual response separately.",
  exportFailed:
    "The package could not be completed. No complete ZIP was downloaded. Refresh and check selected files; an export preparation may already be logged.",
  tooLarge:
    "The selected files or records exceed the export limit. Reduce the file selection or arrange an assisted export.",
  documents: "Select PDF copies",
  archived: "Archived",
  readyDocument: "Ready",
  applyFilter: "Apply filter",
  noDocuments: "No ready documents.",
  tooManyDocuments:
    "More than 200 ready documents: arrange an assisted document export. The request register remains available.",
  documentReview: "Review documents",
  closed:
    "This case is closed. Its history is retained. Record a new linked request if further work is needed.",
  historyHelp:
    "Each change is retained in this restricted register. Export entries record preparation, not receipt by the employee.",
  noEmployees:
    "No employee matches. Refine the search or add the employee record first.",
  noAssignee: "Former HR member",
};
const ro: typeof en = {
  title: "Solicitări privind datele personale",
  intro:
    "Registru HR cu acces limitat pentru solicitări și exporturi verificate.",
  newRequest: "Înregistrează solicitarea",
  employee: "Angajat",
  search: "Caută angajat",
  searchHelp:
    "Caută după nume pentru a restrânge lista (maximum 40 de rezultate).",
  kind: "Tipul solicitării",
  access: "Acces",
  rectification: "Rectificare",
  erasure: "Ștergere",
  restriction: "Restricționare",
  portability: "Portabilitate",
  objection: "Opoziție",
  received: "Primită",
  in_review: "În analiză",
  completed: "Finalizată",
  refused: "Refuzată",
  withdrawn: "Retrasă",
  channel: "Primită prin",
  email: "Email",
  in_person: "Personal",
  post: "Poștă",
  other: "Alt canal",
  receivedOn: "Data primirii",
  initialDue: "Termen inițial",
  due: "Termen de răspuns",
  assignee: "Responsabil HR",
  summary: "Obiectul solicitării / referință",
  state: "Stare",
  save: "Salvează",
  busy: "Se procesează…",
  saved: "Solicitare actualizată.",
  error:
    "Acțiunea nu a putut fi finalizată. Verifică accesul și încearcă din nou.",
  invalid: "Verifică datele, termenele, responsabilul și dovezile necesare.",
  stale:
    "Solicitarea sau un document selectat s-a modificat. Reîncarcă pagina.",
  locked:
    "Exportul necesită o solicitare de acces/portabilitate în analiză și identitate verificată. Solicitările închise nu pot fi modificate.",
  inactive:
    "Organizația este doar pentru citire. Modificările și exporturile nu sunt disponibile.",
  identity: "Referința verificării identității / împuternicirii",
  identityHelp:
    "Completează o referință scurtă numai după verificarea solicitantului și a împuternicirii reprezentantului. Lasă gol până la verificare. Nu încărca aici copii ale actelor de identitate.",
  extension: "Motivul prelungirii",
  notified: "Prelungire comunicată efectiv la",
  deadlineHelp:
    "Termenul sugerat este o lună calendaristică de la primire. HR verifică regulile calendaristice aplicabile. Prelungirea necesită motiv și data comunicării efective; completarea datelor nu trimite notificări.",
  lateNotice:
    "Prelungirea a fost comunicată după termenul inițial. Verifică și escaladează cazul.",
  response: "Referința răspunsului securizat / dovezii retragerii",
  responded: "Data răspunsului / retragerii",
  resolution: "Rezultat, date păstrate sau motivele refuzului",
  closeHelp:
    "Pentru închidere, înregistrează dovada răspunsului sau retragerii, data și rezultatul. Finalizarea necesită identitate verificată. Ștergerea/restricționarea/rectificarea se execută separat; închiderea cazului nu modifică evidențele HR.",
  notesHelp:
    "Folosește referințe interne minime. Evită diagnosticele, parolele, actele de identitate complete și informațiile altor persoane.",
  history: "Istoricul solicitării",
  exports: "Exporturi pregătite (ultimele 20)",
  empty: "Nu există solicitări.",
  all: "Toate",
  open: "Deschise",
  overdue: "Termen depășit",
  previous: "Înapoi",
  next: "Înainte",
  back: "Înapoi la solicitări",
  details: "Deschide solicitarea",
  version: "Versiune",
  noHistory: "Niciun export pregătit.",
  exportTitle: "Pregătește pachetul angajatului pentru verificare",
  from: "Pontaj calculat de la",
  to: "Pontaj calculat până la",
  exportHelp:
    "Sunt incluse evidențele HR enumerate mai jos; pontajul calculat acoperă perioada selectată (maximum 366 de zile). Selectează copiile PDF verificate, inclusiv cele arhivate dacă este cazul. Maximum 50 de fișiere / 50 MB per pachet. Evidențele peste 2 MB necesită export asistat. Pachetul este pentru verificare HR, fără trimitere automată.",
  coverage:
    "Include profil, contracte, concedii, pontaj înregistrat, programe, beneficii, note de onboarding/offboarding, inventar de documente, date de livrare, invitații și apartenența contului la această organizație. Datele de audit/suport/furnizor Auth și copiile terților necesită verificare separată. Verifică textul liber, informațiile terților și informațiile prevăzute de art. 15 înainte de răspuns.",
  confirm:
    "Am verificat identitatea/împuternicirea și obiectul solicitării. Voi verifica evidențele și fișierele selectate pentru informații despre alte persoane înainte de comunicarea securizată a răspunsului.",
  download: "Descarcă ZIP pentru verificare",
  downloaded:
    "Pachet pregătit. Verifică descărcarea și conținutul, apoi înregistrează separat răspunsul efectiv.",
  exportFailed:
    "Pachetul nu a putut fi finalizat. Nu s-a descărcat un ZIP complet. Reîncarcă și verifică fișierele; pregătirea exportului poate fi deja înregistrată.",
  tooLarge:
    "Fișierele sau evidențele depășesc limita. Redu selecția fișierelor sau organizează un export asistat.",
  documents: "Selectează copii PDF",
  archived: "Arhivat",
  readyDocument: "Finalizat",
  applyFilter: "Aplică filtrul",
  noDocuments: "Nu există documente finalizate.",
  tooManyDocuments:
    "Peste 200 de documente finalizate: organizează un export asistat de documente. Registrul solicitărilor rămâne disponibil.",
  documentReview: "Verifică documentele",
  closed:
    "Caz închis, cu istoric păstrat. Înregistrează o nouă solicitare cu referință la aceasta dacă este necesar.",
  historyHelp:
    "Fiecare modificare este păstrată în registrul cu acces limitat. Exporturile înregistrează pregătirea, nu primirea de către angajat.",
  noEmployees:
    "Niciun angajat găsit. Restrânge căutarea sau adaugă mai întâi angajatul.",
  noAssignee: "Fost membru HR",
};
export const privacyDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
