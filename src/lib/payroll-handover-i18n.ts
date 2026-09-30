import type { Locale } from "./i18n";

const en = {
  title: "Accountant handover",
  intro:
    "Download a package for your accountant to review, using the saved calculations in this approved revision.",
  contents:
    "Includes a printable payroll PDF, full payroll CSV, remaining pay CSV, totals CSV, a file manifest and review instructions.",
  scope:
    "Only the employees included in this revision are covered. The package is for accountant review; it is not a SAGA import, D112 declaration or bank payment file.",
  sensitive:
    "The ZIP contains sensitive salary data and is not encrypted. Review it before sharing and use your organisation’s approved secure delivery method.",
  confirm:
    "I have reviewed the included employees and this revision. I understand the package contains sensitive salary data and will review it before securely sharing it with the accountant.",
  historical:
    "This is an older approved revision. The latest approved revision is",
  historicalConfirm:
    "I deliberately need this older revision for reference. I will clearly identify it as historical and check the latest approved revision before acting on any amounts.",
  openCorrection:
    "A correction draft is open for this month. These files use the approved revision shown here; review the correction before the accountant acts on the amounts.",
  download: "Prepare and download ZIP",
  busy: "Preparing package…",
  downloaded:
    "The package was prepared and its download started. Check your downloaded files and review the contents. Nothing was sent to the accountant and no payment was made.",
  history: "Handover preparation history",
  historyHelp:
    "These records show when a package was prepared. They do not confirm a completed download, delivery to an accountant or payment. Each new download creates a preparation record.",
  noHistory: "No handover packages have been prepared for this revision.",
  preparedAt: "Prepared",
  preparedBy: "Prepared by",
  revision: "Revision",
  employees: "Employees",
  language: "Language",
  context: "Context at preparation",
  historicalLabel: "Historical revision",
  currentLabel: "Latest approved revision",
  correctionLabel: "Correction draft open",
  latestRevision: "Latest approved revision",
  reference: "Preparation reference",
  inactive:
    "This organisation is read-only. Existing preparation records remain available; new handover packages cannot be created.",
  invalid:
    "Check the required confirmations and reload the payroll run if needed.",
  error: "The handover package could not be prepared. Try again.",
  stale:
    "The payroll revision changed. Reload this page and review the current details before trying again.",
  locked:
    "A handover package is available only for an approved payroll revision.",
  historicalRequired:
    "A newer approved revision exists. Reload the page and explicitly confirm if you need a historical copy.",
  tooLarge:
    "This package exceeds the supported size. No partial package was downloaded.",
  denied:
    "Your session does not permit this export. Sign in with an authorised HR or organisation owner account and try again.",
  generationFailed:
    "The package could not be completed or downloaded. A preparation record may exist; check the history and try again.",
};

const ro: typeof en = {
  title: "Pachet pentru contabil",
  intro:
    "Descarcă un pachet pentru verificarea contabilului, folosind calculele salvate în această revizie aprobată.",
  contents:
    "Include un PDF de salarizare pentru tipărire, un CSV cu toate calculele, un CSV cu restul de plată, un CSV cu totaluri, inventarul fișierelor și instrucțiuni de verificare.",
  scope:
    "Sunt acoperiți doar angajații incluși în această revizie. Pachetul este destinat verificării de către contabil; nu este un import SAGA, o declarație D112 sau un fișier de plată bancară.",
  sensitive:
    "Arhiva ZIP conține date salariale sensibile și nu este criptată. Verifică fișierele înainte de partajare și folosește metoda securizată aprobată de organizație.",
  confirm:
    "Am verificat angajații incluși și această revizie. Înțeleg că pachetul conține date salariale sensibile și îl voi verifica înainte de a-l transmite securizat contabilului.",
  historical:
    "Aceasta este o revizie aprobată mai veche. Ultima revizie aprobată este",
  historicalConfirm:
    "Am nevoie în mod intenționat de această revizie mai veche pentru referință. O voi identifica explicit ca istorică și voi verifica ultima revizie aprobată înainte de utilizarea sumelor.",
  openCorrection:
    "Există o ciornă de corecție pentru această lună. Fișierele folosesc revizia aprobată afișată aici; verifică acea corecție înainte ca sumele să fie utilizate de contabil.",
  download: "Pregătește și descarcă ZIP",
  busy: "Se pregătește pachetul…",
  downloaded:
    "Pachetul a fost pregătit și descărcarea a început. Verifică fișierele descărcate și conținutul lor. Nu s-a trimis nimic contabilului și nu s-a efectuat nicio plată.",
  history: "Istoricul pregătirii pachetelor",
  historyHelp:
    "Înregistrările arată când a fost pregătit un pachet. Nu confirmă finalizarea descărcării, transmiterea către contabil sau plata. Fiecare descărcare nouă creează o înregistrare de pregătire.",
  noHistory: "Nu au fost pregătite pachete pentru această revizie.",
  preparedAt: "Pregătit la",
  preparedBy: "Pregătit de",
  revision: "Revizie",
  employees: "Angajați",
  language: "Limbă",
  context: "Situația la pregătire",
  historicalLabel: "Revizie istorică",
  currentLabel: "Ultima revizie aprobată",
  correctionLabel: "Ciornă de corecție deschisă",
  latestRevision: "Ultima revizie aprobată",
  reference: "Referința pregătirii",
  inactive:
    "Organizația este în mod de citire. Istoricul rămâne disponibil; nu se pot pregăti pachete noi pentru contabil.",
  invalid:
    "Verifică confirmările obligatorii și reîncarcă statul de salarizare dacă este necesar.",
  error: "Nu am putut pregăti pachetul pentru contabil. Încearcă din nou.",
  stale:
    "Revizia de salarizare s-a schimbat. Reîncarcă pagina și verifică datele actuale înainte de a încerca din nou.",
  locked:
    "Pachetul pentru contabil este disponibil doar pentru o revizie de salarizare aprobată.",
  historicalRequired:
    "Există o revizie aprobată mai nouă. Reîncarcă pagina și confirmă explicit dacă ai nevoie de o copie istorică.",
  tooLarge:
    "Pachetul depășește dimensiunea acceptată. Nu s-a descărcat un pachet parțial.",
  denied:
    "Sesiunea ta nu permite acest export. Autentifică-te cu un cont HR sau de proprietar autorizat și încearcă din nou.",
  generationFailed:
    "Nu am putut finaliza sau descărca pachetul. Poate exista o înregistrare de pregătire; verifică istoricul și încearcă din nou.",
};

export const payrollHandoverDictionary = (locale: Locale) =>
  locale === "ro" ? ro : en;
