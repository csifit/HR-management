import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { PageHeader } from "@/components/ui";
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
    </>
  );
}
