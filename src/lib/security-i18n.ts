import type { Locale } from "./i18n";
const en = {
  title: "Account security",
  intro:
    "Add an authenticator app to protect your account. MFA is optional; once enabled, a code is required after signing in.",
  verifyTitle: "Verify your sign-in",
  verifyHelp:
    "Enter a code from one of your registered authenticators to continue.",
  add: "Add authenticator",
  name: "Authenticator name",
  nameHint: "For example: phone or backup device",
  scan: "Scan this QR code with your authenticator app. Keep the setup key private.",
  manual: "Manual setup key",
  code: "6-digit code",
  verify: "Verify",
  cancel: "Cancel setup",
  remove: "Remove",
  confirm: "I confirm removal of this authenticator.",
  enabled: "Enabled",
  pending: "Setup incomplete",
  empty: "No authenticator enabled.",
  error: "The operation failed. Check your code and connection, then retry.",
  saved: "Account security updated.",
  busy: "Working…",
  continue: "Continue to workspace",
  signOut: "Sign out",
  recovery:
    "Keep a second authenticator on a separate device before replacing your phone. If all authenticators are lost, contact your platform administrator for identity-verified recovery; resetting your password alone does not disable MFA.",
  factor: "Authenticator",
};
const ro: typeof en = {
  title: "Securitatea contului",
  intro:
    "Adaugă o aplicație de autentificare pentru protecția contului. MFA este opțională; după activare, este necesar un cod la autentificare.",
  verifyTitle: "Verifică autentificarea",
  verifyHelp:
    "Introdu un cod dintr-o aplicație de autentificare înregistrată pentru a continua.",
  add: "Adaugă autentificator",
  name: "Numele autentificatorului",
  nameHint: "De exemplu: telefon sau dispozitiv de rezervă",
  scan: "Scanează codul QR în aplicația de autentificare. Păstrează cheia de configurare privată.",
  manual: "Cheie pentru configurare manuală",
  code: "Cod de 6 cifre",
  verify: "Verifică",
  cancel: "Anulează configurarea",
  remove: "Elimină",
  confirm: "Confirm eliminarea acestui autentificator.",
  enabled: "Activat",
  pending: "Configurare incompletă",
  empty: "Niciun autentificator activat.",
  error: "Operațiunea a eșuat. Verifică codul și conexiunea, apoi reîncearcă.",
  saved: "Securitatea contului a fost actualizată.",
  busy: "Se procesează…",
  continue: "Continuă în aplicație",
  signOut: "Deconectare",
  recovery:
    "Păstrează un al doilea autentificator pe un dispozitiv separat înainte să schimbi telefonul. Dacă pierzi toate autentificatoarele, contactează administratorul platformei pentru recuperare cu verificarea identității; resetarea parolei nu dezactivează MFA.",
  factor: "Autentificator",
};
export function securityDictionary(locale: Locale) {
  return locale === "ro" ? ro : en;
}
