import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { getLocale } from "@/lib/locale";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: "Platformă de management HR pentru echipa ta.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={await getLocale()}>
      <body>{children}</body>
    </html>
  );
}
