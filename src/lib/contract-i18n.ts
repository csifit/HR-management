import type { Locale } from "./i18n";

export function contractDictionary(locale: Locale) {
  return locale === "ro"
    ? {
        expiry: "Data expirării contractului pe durată determinată",
        lastDay: "Ultima zi de angajare (inclusiv)",
        lastDayHelp:
          "Completează data efectivă când este cunoscută, inclusiv pentru contractele pe durată nedeterminată. Data nu modifică automat statutul contractului sau al angajatului.",
        stale:
          "Contractul s-a modificat. Reîncarcă pagina și verifică datele înainte de salvare.",
      }
    : {
        expiry: "Planned fixed-term expiry",
        lastDay: "Last employed day (inclusive)",
        lastDayHelp:
          "Enter the effective date when known, including for indefinite contracts. This date does not automatically change the contract or employee status.",
        stale:
          "This contract changed. Reload the page and review it before saving.",
      };
}
