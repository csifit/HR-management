import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { reges } from "@/lib/reges";
import { PageHeader } from "@/components/ui";
import { RegesForm } from "@/components/reges-form";
export default async function RegesPage() {
  const { supabase, organisation, membership } = await requireHR(),
    locale = await getLocale(),
    ro = locale === "ro";
  const { data, error } = await supabase
    .from("reges_connections")
    .select("*")
    .eq("organisation_id", organisation.id)
    .maybeSingle();
  if (error) throw new Error("REGES settings could not be loaded.");
  return (
    <>
      <PageHeader
        title="REGES-ONLINE"
        description={
          ro
            ? "Pregătirea accesului pentru organizația ta."
            : "Prepare access for your organisation."
        }
      />
      <p className="notice">
        {ro
          ? "Conexiune neactivată. ID-urile salvate nu confirmă accesul și nu transmit date în REGES."
          : "Connection not enabled. Saved identifiers do not confirm access or transmit data to REGES."}
      </p>
      <div className="time-settings-grid">
        <section className="card time-form-card">
          <h2>{organisation.name}</h2>
          <p className="time-help">CUI: {organisation.cui}</p>
          {membership.role === "organisation_owner" &&
          organisation.status === "active" ? (
            <RegesForm record={data} locale={locale} />
          ) : (
            <dl className="details-grid">
              <dt>ID angajator</dt>
              <dd>{data?.employer_id ?? "—"}</dd>
              <dt>ID utilizator</dt>
              <dd>{data?.author_id ?? "—"}</dd>
            </dl>
          )}
        </section>
        <section className="card time-form-card">
          <h2>{ro ? "Înainte de conectare" : "Before connecting"}</h2>
          <ol className="integration-steps">
            <li>
              {ro
                ? "HR verifică fiecare contract în profilul angajatului, fila Contract. Orice modificare invalidează verificarea pentru transmitere."
                : "HR reviews each contract in the employee profile, Contract tab. Every change invalidates its submission review."}
            </li>
            <li>
              {ro
                ? "Verifică dreptul de acces pentru angajatorul corect în REGES-ONLINE."
                : "Verify access to the correct employer in REGES-ONLINE."}
            </li>
            <li>
              {ro
                ? "Din Setări → Angajator → Utile, copiază ID-ul utilizatorului și ID-ul angajatorului."
                : "Under Settings → Employer → Utilities, copy the user and employer identifiers."}
            </li>
            <li>
              {ro
                ? "Credențialele pentru sistemul extern se configurează într-o etapă separată, cu stocare criptată și verificarea conexiunii."
                : "External-system credentials will be configured separately with encrypted storage and connection verification."}
            </li>
            <li>
              {ro
                ? "Transmiterea va necesita maparea completă a datelor și confirmarea rezultatului REGES, nu doar primirea unei recipise."
                : "Submission will require complete data mapping and confirmation of the REGES result, beyond the initial receipt."}
            </li>
          </ol>
          <div className="form-stack">
            <a href={reges.guide} target="_blank" rel="noreferrer">
              {ro
                ? "Ghid oficial pentru angajatori"
                : "Official employer guide"}{" "}
              ↗
            </a>
            <a href={reges.developerGuide} target="_blank" rel="noreferrer">
              {ro ? "Documentație API" : "API documentation"} ↗
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
