import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import styles from "./page.module.css";
const origin = "https://www.mkdir.space";
const title = `${brand.name}: software HR management pentru companii din România`;
const description =
  "Gestionare angajați, contracte de muncă, pontaje, concedii, beneficii și documente într-o platformă HR cu acces pe roluri. Pregătire pentru conectare REGES-ONLINE.";
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: `${origin}/hr-management-romania` },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ro_RO",
    title,
    description,
    url: `${origin}/hr-management-romania`,
    siteName: brand.name,
  },
};
export default function HrRomaniaPage() {
  const structured = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    url: origin,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: ["ro", "en"],
    description,
    featureList: [
      "Gestionare angajați",
      "Gestionare contracte angajați",
      "Gestionare pontaje și concedii",
      "Administrare beneficii",
      "Documente PDF și liste de angajare și plecare",
    ],
  };
  return (
    <main className={styles.page} lang="ro">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
        }}
      />
      <header className={styles.hero}>
        <a href={origin} className={styles.brand}>
          {brand.name}
        </a>
        <p className={styles.eyebrow}>Resurse umane · România</p>
        <h1>Mai multă claritate pentru echipa ta.</h1>
        <p className={styles.lead}>
          {brand.name} este o platformă de HR management pentru organizațiile
          din România care vor să aducă evidența angajaților, contractele,
          pontajele și documentele în același spațiu de lucru.
        </p>
        <a className={styles.button} href={origin}>
          Deschide {brand.name} →
        </a>
      </header>
      <section className={styles.section}>
        <h2>Gestionare angajați și contracte de muncă</h2>
        <p>
          Păstrezi profilurile angajaților, funcțiile, departamentele și
          managerii într-un registru organizat. Cauți rapid un coleg și
          urmărești contractele, datele de început și de sfârșit și starea
          raportului de muncă. Accesul la informațiile salariale este separat de
          accesul la lista de angajați.
        </p>
        <p>
          Pentru gestionare contracte angajați, echipa HR poate crea și
          actualiza evidențele contractuale și poate consulta istoricul
          modificărilor. O singură persoană poate lucra cu mai multe
          organizații, fiecare cu propriile date și permisiuni.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Gestionare pontaje, concedii și beneficii</h2>
        <p>
          Înregistrezi orele planificate și lucrate pe zi, verifici situația
          lunară și urmărești cererile de concediu și aprobările. Calendarul
          poate include excepții stabilite de companie, iar soldurile de
          concediu sunt configurate de HR.
        </p>
        <p>
          Beneficiile pot avea valori fixe, valori pe zi lucrată, bugete anuale
          sau flexibile. Echipa HR verifică propunerile lunare, ajustează
          excepțiile și aprobă alocările. Tarifele și regulile pentru beneficii
          sunt configurate de companie. Tratamentul fiscal al beneficiilor
          necesită verificarea echipei de salarizare.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Documente și pași clari la angajare sau plecare</h2>
        <p>
          Încarci documente PDF și stabilești dacă pot fi văzute de angajat sau
          doar de HR. Generezi fișe informative și scrisori cu datele
          angajatului. Listele de verificare pentru angajare și plecare ajută
          echipa să urmărească documentele, echipamentele și accesul la
          organizație.
        </p>
        <p>
          Arhivarea păstrează documentele și istoricul. Semnarea electronică și
          transmiterea către furnizori externi nu sunt incluse în această etapă.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Conectare REGES-ONLINE: pregătirea integrării</h2>
        <p>
          Dacă ai nevoie de conectare REGES, {brand.name} pregătește structura
          necesară unei integrări cu REGES-ONLINE. Conexiunea API și
          transmiterea automată în registru nu sunt încă active. Configurarea și
          verificarea accesului oficial vor preceda orice transmitere.
        </p>
        <p>
          În etapa actuală, evidența internă a angajaților și contractelor ajută
          la organizarea datelor. Obligațiile de raportare și operațiunile din
          REGES rămân în responsabilitatea angajatorului.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Acces potrivit fiecărui rol</h2>
        <p>
          Proprietarul organizației, managerul HR, managerii de echipă și
          angajații au permisiuni diferite. Un angajat vede datele proprii la
          care are acces. Managerii nu primesc automat acces la salariile sau
          documentele private ale echipei. Datele sunt separate între
          organizații.
        </p>
        <p>
          Interfața este disponibilă în română și engleză. Identitatea vizuală
          poate fi adaptată la nivelul instalării, fără a schimba evidențele HR.
        </p>
      </section>
      <section className={styles.section}>
        <h2>Întrebări despre {brand.name}</h2>
        <h3>Este o soluție completă de salarizare?</h3>
        <p>
          Calculatorul salarial calculează automat CAS, CASS, impozitul și netul
          pentru cazurile standard acceptate din 2026 și generează fluturași
          PDF. Sunt incluse luni complete cu timp parțial, diferențele de
          contribuții suportate de angajator, tichetele de masă declarate și
          avansurile deja plătite, pentru sume în lei întregi. Lunile parțiale,
          concediile, alte beneficii și scutirile de impozit necesită tratare
          separată. Rezultatele trebuie verificate înaintea plății; platforma nu
          execută plăți bancare și nu depune D112.
        </p>
        <h3>Trimite deja contractele în REGES?</h3>
        <p>
          Nu. Integrarea REGES este în pregătire. Funcțiile disponibile și
          starea conexiunii trebuie verificate în aplicație înainte de
          utilizare.
        </p>
        <h3>De unde încep?</h3>
        <p>
          Accesează <a href={origin}>{brand.name} pe mkdir.space</a> pentru
          autentificare și configurarea organizației. Pentru gestionare
          angajați, contracte și pontaje, începe cu echipa și permisiunile de
          acces.
        </p>
      </section>
      <footer className={styles.footer}>
        <a href={origin}>Mergi la {brand.name} →</a>
        <span>Informații actualizate la 23 septembrie 2026</span>
      </footer>
    </main>
  );
}
