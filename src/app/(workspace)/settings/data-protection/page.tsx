import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { PageHeader } from "@/components/ui";
import { serviceProvider } from "@/lib/service-provider";
export default async function DataProtectionPage() {
  await requireHR();
  const ro = (await getLocale()) === "ro";
  const controls = ro
    ? [
        "Acces pe roluri și separare între organizații, aplicate în baza de date.",
        "Documente private, acces explicit pentru angajat și arhivare cu păstrarea istoricului.",
        "MFA opțională; după activare, se aplică și accesului direct la date și fișiere.",
        "Revocarea accesului la plecare, fără eliminarea evidențelor HR.",
        "Email cu destinatar verificat de HR și fără reîncercări automate când rezultatul este necunoscut.",
      ]
    : [
        "Role-based access and organisation isolation enforced in the database.",
        "Private documents, explicit employee visibility and archival history.",
        "Optional MFA, enforced on direct data and file access after enrollment.",
        "Offboarding access revocation without deleting HR records.",
        "HR-reviewed email recipients and no automatic retries after uncertain outcomes.",
      ];
  const duties = ro
    ? [
        "Stabilește temeiurile de prelucrare, informarea angajaților și contactul responsabil pentru protecția datelor.",
        "Încheie acordurile necesare cu furnizorii și verifică locațiile de găzduire și transferurile internaționale.",
        "Definește termenele de păstrare pentru fiecare categorie. Arhivarea nu șterge fișierele; această versiune nu execută ștergeri automate.",
        "Organizează solicitările de acces, rectificare, export și ștergere, cu verificarea identității și a obligațiilor de păstrare.",
        "Stabilește procedura pentru incidente, notificări și recuperare MFA; testează copiile de siguranță și restaurarea.",
      ]
    : [
        "Define processing purposes and legal bases, employee notices and a data-protection contact.",
        "Execute required provider agreements and verify hosting regions and international transfers.",
        "Set retention periods by category. Archiving does not delete files; this version performs no automatic erasure.",
        "Handle access, correction, export and erasure requests with identity verification and retention checks.",
        "Define incident, notification and MFA recovery procedures; test backups and restoration.",
      ];
  return (
    <>
      <PageHeader
        title={ro ? "Protecția datelor" : "Data protection"}
        description={
          ro
            ? "Controale tehnice și responsabilități operaționale."
            : "Technical controls and operational responsibilities."
        }
      />
      <p className="notice">
        {ro
          ? "Controalele aplicației sprijină protecția datelor. Conformitatea GDPR necesită și documente, decizii și proceduri ale organizației; nu este o certificare automată."
          : "Application controls support data protection. GDPR compliance also requires organisational documents, decisions and procedures; this is not an automatic certification."}
      </p>
      <section className="card time-form-card">
        <h2>
          {ro
            ? "Organizația și furnizorul serviciului"
            : "Your organisation and the service provider"}
        </h2>
        <p>
          <strong>{serviceProvider.name}</strong> · {serviceProvider.address}
        </p>
        <p>
          {ro ? "Contact pentru protecția datelor" : "Data-protection contact"}:{" "}
          <a href={`mailto:${serviceProvider.privacyEmail}`}>
            {serviceProvider.privacyEmail}
          </a>
        </p>
        <p>
          {ro
            ? "Pentru evidențele HR, organizația stabilește scopurile și temeiurile prelucrării și este, de regulă, operator. Furnizorul prelucrează datele conform instrucțiunilor documentate, ca persoană împuternicită. Contractul de prelucrare, furnizorii secundari și termenele de păstrare trebuie convenite separat."
            : "For HR records, your organisation determines purposes and legal bases and ordinarily acts as controller. The provider processes them on documented instructions as processor. The processing agreement, subprocessors and retention terms must be agreed separately."}
        </p>
        <p>
          {ro
            ? "Furnizorul are obligații proprii privind confidențialitatea, securitatea, asistența pentru drepturi și incidente, subcontractarea și returnarea/ștergerea datelor. Pentru propriile activități de facturare și administrare a conturilor, poate avea separat rol de operator."
            : "The provider has its own confidentiality, security, rights/incident assistance, subcontracting and data return/deletion duties. It may separately act as controller for its own billing and account administration."}
        </p>
      </section>
      <div className="time-settings-grid">
        <section className="card time-form-card">
          <h2>{ro ? "Controale în aplicație" : "Application controls"}</h2>
          <ul className="integration-steps">
            {controls.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <Link href="/account/security" className="button secondary">
            {ro ? "Configurează MFA" : "Configure MFA"}
          </Link>
        </section>
        <section className="card time-form-card">
          <h2>
            {ro ? "De stabilit în organizație" : "Organisational decisions"}
          </h2>
          <ul className="integration-steps">
            {duties.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <a
            href="https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en"
            target="_blank"
            rel="noreferrer"
          >
            {ro
              ? "Ghidul Comitetului European pentru Protecția Datelor"
              : "European Data Protection Board guidance"}{" "}
            ↗
          </a>
        </section>
      </div>
      <section className="card time-form-card">
        <h2>
          {ro
            ? "Procedură pentru solicitările persoanelor"
            : "Procedure for individual requests"}
        </h2>
        <ol className="integration-steps">
          <li>
            {ro
              ? "Înregistrează data primirii, tipul solicitării, organizația și un responsabil. Păstrează evidența într-un sistem cu acces limitat."
              : "Record the receipt date, request type, organisation and responsible person in a restricted operational register."}
          </li>
          <li>
            {ro
              ? "Verifică proporțional identitatea și stabilește termenul: de regulă o lună calendaristică. O prelungire justificată trebuie comunicată în termenul inițial."
              : "Verify identity proportionately and track the normal one-calendar-month response deadline. Communicate any justified extension within the initial deadline."}
          </li>
          <li>
            {ro
              ? "Organizația decide asupra evidențelor HR; furnizorul oferă asistență pe baza instrucțiunilor verificate. Verifică datele altor persoane și obligațiile de păstrare înainte de export sau ștergere."
              : "The organisation decides requests concerning its HR records; the provider assists on verified instructions. Check other people's data and retention duties before export or deletion."}
          </li>
          <li>
            {ro
              ? "Comunică răspunsul securizat și înregistrează rezultatul, motivele și data. Descărcarea unui PDF nu este un export complet al datelor, iar arhivarea nu este ștergere."
              : "Deliver the response securely and record its outcome, reasons and date. Downloading one PDF is not a complete data export, and archiving is not erasure."}
          </li>
        </ol>
        <p className="time-help">
          {ro
            ? "La un incident, contactează imediat responsabilul și furnizorul. Persoana împuternicită notifică operatorul fără întârzieri nejustificate; nu are automat 72 de ore la dispoziție. Operatorul evaluează notificările către autoritate și persoanele afectate."
            : "For an incident, contact the responsible person and provider promptly. A processor notifies the controller without undue delay; it does not automatically have 72 hours. The controller assesses authority and individual notifications."}
        </p>
      </section>
    </>
  );
}
