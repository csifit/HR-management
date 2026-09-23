import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { Brand } from "@/components/ui";
import { InvitationForm } from "@/components/invitation-forms";
import { signOut } from "@/app/actions";
import { isConfigured } from "@/lib/supabase/config";
import { redirect } from "next/navigation";
export default async function JoinPage() {
  if (!isConfigured()) redirect("/setup");
  const locale = await getLocale(),
    ro = locale === "ro",
    client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const context = user ? await requireUser() : null;
  const invitations = context
    ? await context.supabase.rpc("my_employee_invitations")
    : { data: [], error: null };
  if (invitations.error) throw new Error("Invitations could not be loaded.");
  return (
    <div className="standalone-page">
      <header>
        <Brand />
      </header>
      <main className="setup-card card form-stack">
        <h1>{ro ? "Alătură-te echipei" : "Join your team"}</h1>
        <p>
          {ro
            ? "Folosește adresa de email la care ai primit invitația. Accesul acordat este exclusiv de angajat."
            : "Use the email address that received the invitation. Invitations grant employee access only."}
        </p>
        {!user ? (
          <>
            <Link className="button primary" href="/register?next=/join">
              {ro ? "Creează cont" : "Create account"}
            </Link>
            <Link className="button secondary" href="/login?next=/join">
              {ro ? "Am deja cont" : "I already have an account"}
            </Link>
          </>
        ) : (
          <>
            <p>{user.email}</p>
            {invitations.data?.length ? (
              invitations.data.map((i) => (
                <section className="form-stack" key={i.id}>
                  <h2>{i.organisation_name}</h2>
                  <InvitationForm
                    id={i.id}
                    operation="accept"
                    locale={locale}
                  />
                </section>
              ))
            ) : (
              <p className="notice">
                {ro
                  ? "Nu există invitații active pentru acest cont. Confirmă emailul sau cere HR o invitație nouă."
                  : "There are no active invitations for this account. Verify your email or ask HR for a new invitation."}
              </p>
            )}
            <Link href="/dashboard">
              {ro ? "Continuă către cont" : "Continue to account"}
            </Link>
            <form action={signOut}>
              <button className="text-button">
                {ro ? "Ieșire din cont" : "Sign out"}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
