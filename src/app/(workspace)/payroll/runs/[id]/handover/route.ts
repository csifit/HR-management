import { revalidatePath } from "next/cache";
import { requireHR } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { getLocale } from "@/lib/locale";
import { idSchema } from "@/lib/validation";
import { payrollHandoverDictionary } from "@/lib/payroll-handover-i18n";
import { readHandoverRequest } from "@/lib/payroll-handover-http";
import {
  buildPayrollHandoverArchive,
  HandoverSizeError,
} from "@/lib/payroll-handover-archive";

export const runtime = "nodejs";
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, noarchive",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const d = payrollHandoverDictionary(await getLocale());
  const failure = (error: string, status = 400) =>
    Response.json({ error }, { status, headers: privateHeaders });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return failure(d.invalid);
  let input;
  try {
    input = await readHandoverRequest(request);
  } catch {
    return failure(d.invalid);
  }
  // Keep auth redirects outside generation error handling. Database RPCs repeat
  // tenant/role/MFA/status checks with the request user's token, never a service key.
  const { supabase, organisation } = await requireHR(true);
  const { data, error } = await supabase.rpc("prepare_payroll_handover", {
    p_org: organisation.id,
    p_run: id.data,
    p_version: input.version,
    p_locale: await getLocale(),
    p_confirm: input.confirm,
    p_allow_historical: input.allowHistorical,
  });
  if (error) {
    const errors: Record<string, string> = {
      P0006: d.stale,
      D0001: d.locked,
      P0013: d.historicalRequired,
      P0012: d.tooLarge,
      P0010: d.generationFailed,
      "42501": d.denied,
      P0004: d.inactive,
      "22023": d.invalid,
    };
    return failure(
      errors[error.code] ?? d.error,
      error.code === "42501" ? 403 : 409,
    );
  }
  try {
    const bytes = await buildPayrollHandoverArchive(data, brand.name);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="payroll-${data.run.month.slice(0, 7)}-r${data.run.revision}-accountant.zip"`,
      },
    });
  } catch (error) {
    return failure(
      error instanceof HandoverSizeError ? d.tooLarge : d.generationFailed,
      500,
    );
  } finally {
    // Preparation is recorded before generation; history must show failed attempts too.
    revalidatePath(`/payroll/runs/${id.data}`);
  }
}
