import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/supabase/config";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/locale";
import { brand } from "@/lib/brand";
import { LanguageSwitch } from "@/components/shell";
import styles from "./hr-management-romania/page.module.css";
export const metadata: Metadata = {
  title: { absolute: `${brand.name} · HR pentru echipa ta` },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.mkdir.space" },
};
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  // Supabase may fall back to the configured site root before redirect URLs are set.
  if (code) redirect(`/auth/confirm?code=${encodeURIComponent(code)}`);
  if (isConfigured()) {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (user) redirect("/dashboard");
  }
  const locale = await getLocale(),
    ro = locale === "ro";
  return (
    <main className={styles.page}>
      <header className="public-navigation">
        <Link href="/" className={styles.brand}>
          {brand.name}
        </Link>
        <div className="time-actions">
          <LanguageSwitch locale={locale} />
          <Link className="button secondary" href="/login">
            {ro ? "Autentificare" : "Sign in"}
          </Link>
        </div>
      </header>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>
          {ro
            ? "Oameni. Echipe. Mai puțină birocrație."
            : "People. Teams. Less paperwork."}
        </p>
        <h1>
          {ro
            ? "Tot ce ține de echipă, într-un singur loc."
            : "Your team, organised in one place."}
        </h1>
        <p className={styles.lead}>
          {ro
            ? "Angajați, contracte, pontaje, concedii și documente — un spațiu de lucru clar pentru HR și fiecare coleg."
            : "Employees, contracts, attendance, leave and documents — a clear workspace for HR and every colleague."}
        </p>
        <Link href="/register" className={styles.button}>
          {ro ? "Creează contul companiei" : "Create your company account"} →
        </Link>
        <p className="public-price">
          2 € / {ro ? "angajat / lună" : "employee / month"}
          <small>
            {ro
              ? "Taxele aplicabile se precizează în ofertă."
              : "Applicable taxes are specified in your offer."}
          </small>
        </p>
      </section>
      <section className={styles.section}>
        <h2>{ro ? "Un ritm de lucru mai simplu" : "A simpler working day"}</h2>
        <p>
          {ro
            ? "Invită angajații, urmărește pașii de angajare și aprobă concediile. Pontajul pornește de la orele din contract, cu ajustări la îndemâna HR. Documentele și informațiile salariale au acces controlat."
            : "Invite employees, track onboarding and approve leave. Attendance starts from contract hours, with HR adjustments when needed. Documents and salary information have controlled access."}
        </p>
      </section>
      <footer className={styles.footer}>
        <span>{brand.name}</span>
        <Link href="/login">{ro ? "Intră în cont" : "Open your account"}</Link>
      </footer>
    </main>
  );
}
