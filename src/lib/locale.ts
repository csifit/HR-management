import "server-only";
import { cookies } from "next/headers";
import { dictionary, type Locale } from "./i18n";
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("hr-locale")?.value === "en" ? "en" : "ro";
}
export async function getDictionary() {
  return dictionary(await getLocale());
}
