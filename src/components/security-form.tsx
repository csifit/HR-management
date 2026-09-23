"use client";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";
import { securityDictionary } from "@/lib/security-i18n";
import { brand } from "@/lib/brand";
import type { Locale } from "@/lib/i18n";
type Factor = { id: string; name: string; verified: boolean };
export function SecurityForm({
  locale,
  factors,
  needsVerification,
}: {
  locale: Locale;
  factors: Factor[];
  needsVerification: boolean;
}) {
  const d = securityDictionary(locale),
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<"error" | "saved" | null>(null),
    [setup, setSetup] = useState<{
      id: string;
      qr: string;
      secret: string;
    } | null>(null);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch {
      setMessage("error");
    } finally {
      setBusy(false);
    }
  }
  function enroll(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    void run(async () => {
      const { data, error } = await browserSupabase().auth.mfa.enroll({
        factorType: "totp",
        friendlyName: name,
        issuer: brand.name,
      });
      if (error || !data) throw error;
      setSetup({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    });
  }
  function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form),
      code = String(data.get("code") ?? ""),
      id = setup?.id ?? String(data.get("factor") ?? "");
    void run(async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Invalid code");
      const { error } = await browserSupabase().auth.mfa.challengeAndVerify({
        factorId: id,
        code,
      });
      if (error) throw error;
      setSetup(null);
      form.reset();
      setMessage("saved");
      if (needsVerification) router.replace("/dashboard");
      router.refresh();
    });
  }
  function remove(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    void run(async () => {
      const { error } = await browserSupabase().auth.mfa.unenroll({
        factorId: id,
      });
      if (error) throw error;
      const refreshed = await browserSupabase().auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      setSetup(null);
      setMessage("saved");
      router.refresh();
    });
  }
  return (
    <div className="form-stack">
      <div aria-live="polite">
        {message && (
          <p className={`notice ${message === "error" ? "error" : "success"}`}>
            {d[message]}
          </p>
        )}
      </div>
      {(needsVerification || setup) && (
        <form onSubmit={verify} className="form-stack">
          <fieldset disabled={busy} className="time-fieldset form-stack">
            {setup ? (
              <>
                <p>{d.scan}</p>
                <Image
                  src={
                    setup.qr.startsWith("data:")
                      ? setup.qr
                      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr)}`
                  }
                  alt={d.scan}
                  width={220}
                  height={220}
                  unoptimized
                />
                <details>
                  <summary>{d.manual}</summary>
                  <code className="security-secret">{setup.secret}</code>
                </details>
              </>
            ) : (
              <label className="field">
                <span>{d.factor}</span>
                <select name="factor" required>
                  {factors
                    .filter((f) => f.verified)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>{d.code}</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
            </label>
            <button className="button primary">
              {busy ? d.busy : d.verify}
            </button>
          </fieldset>
        </form>
      )}
      {setup && (
        <form onSubmit={(e) => remove(e, setup.id)}>
          <button className="button secondary" disabled={busy}>
            {d.cancel}
          </button>
        </form>
      )}
      {!needsVerification && !setup && (
        <>
          <ul className="security-factors">
            {factors.map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong>
                <p className="time-help">
                  {f.verified ? d.enabled : d.pending}
                </p>
                <form onSubmit={(e) => remove(e, f.id)} className="form-stack">
                  <label className="benefit-confirm">
                    <input type="checkbox" required disabled={busy} />
                    {d.confirm}
                  </label>
                  <button className="button secondary" disabled={busy}>
                    {d.remove}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {!factors.length && <p>{d.empty}</p>}
          <form onSubmit={enroll} className="form-stack">
            <fieldset disabled={busy} className="time-fieldset form-stack">
              <label className="field">
                <span>{d.name}</span>
                <input
                  name="name"
                  required
                  minLength={1}
                  maxLength={60}
                  placeholder={d.nameHint}
                />
              </label>
              <button className="button primary">
                {busy ? d.busy : d.add}
              </button>
            </fieldset>
          </form>
        </>
      )}
    </div>
  );
}
