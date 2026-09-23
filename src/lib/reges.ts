// Readiness is deliberately distinct from connection or submission success.
export const reges = {
  guide:
    "https://reges.inspectiamuncii.ro/ajutor/ghid-utilizare-aplicatie-angajator/setari-angajator/setari-angajator-utile/",
  developerGuide: "https://github.com/reges-ro/integrare",
  available: false,
  async submit(): Promise<never> {
    throw new Error("REGES transmission is not configured.");
  },
};
export type RegesConnection = {
  organisation_id: string;
  employer_id: string | null;
  author_id: string | null;
  updated_at: string;
  updated_by: string | null;
  version: number;
};
