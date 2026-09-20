import Link from "next/link";
import { getDictionary } from "@/lib/locale";
export default async function NotFound() {
  const d = await getDictionary();
  return (
    <div className="standalone-page">
      <main className="setup-card card">
        <span className="eyebrow">404</span>
        <h1>{d.notFound}</h1>
        <p>{d.notFoundBody}</p>
        <Link href="/dashboard" className="button primary">
          {d.overview}
        </Link>
      </main>
    </div>
  );
}
