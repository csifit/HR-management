import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganisation } from "./auth";
import { getLocale } from "./locale";
import { canManage, type ActionState } from "./types";
import { documentDictionary } from "./document-i18n";
export async function parseDocumentAction<T>(schema:z.ZodType<T>,form:FormData) {
  const context=await requireOrganisation();
  const d=documentDictionary(await getLocale());
  if(!canManage(context.membership.role)) return {error:{error:d.denied} as ActionState};
  if(context.organisation.status!=="active") return {error:{error:d.inactive} as ActionState};
  const values=Object.fromEntries([...form.entries()].filter(([k,v])=>!k.startsWith("$")&&typeof v==="string")) as Record<string,string>;
  const parsed=schema.safeParse(values);
  if(!parsed.success) return {error:{error:d.invalid,values} as ActionState};
  return {context,values,data:parsed.data};
}
export async function finishDocumentAction(error:{code?:string}|null,values?:Record<string,string>):Promise<ActionState> {
  const d=documentDictionary(await getLocale());
  if(error) {
    const codes:Record<string,string>={"42501":d.denied,"23505":d.duplicate,"23503":d.invalid,"23514":d.invalid,"22023":d.invalid,P0002:d.lastOwner,P0004:d.inactive,P0006:d.stale,D0001:d.locked,D0002:d.incomplete,D0003:d.self,D0004:d.linked,D0005:d.unfinished};
    return {error:codes[error.code??""]??d.error,values};
  }
  revalidatePath("/documents"); revalidatePath("/lifecycle","layout"); revalidatePath("/dashboard"); revalidatePath("/settings/team"); revalidatePath("/employees","layout");
  return {success:d.saved};
}
