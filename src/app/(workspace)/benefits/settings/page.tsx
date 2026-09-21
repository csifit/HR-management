import Link from "next/link";
import { requireHR } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { benefitDictionary } from "@/lib/benefit-i18n";
import { benefitCatalogue } from "@/lib/benefit-data";
import { benefitsProvider } from "@/lib/benefit-providers";
import { singleParam } from "@/lib/time";
import { moneyLabel } from "@/lib/i18n";
import { PageHeader } from "@/components/ui";
import { BenefitForm, ProviderForm } from "@/components/benefit-forms";
export default async function BenefitSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organisation } = await requireHR();
  const locale = await getLocale();
  const d = benefitDictionary(locale);
  const { benefits, providers } = await benefitCatalogue();
  const search = singleParam((await searchParams).q)
    .trim()
    .toLocaleLowerCase();
  const filteredBenefits = benefits.filter((b) =>
    b.name.toLocaleLowerCase().includes(search),
  );
  const filteredProviders = providers.filter((p) =>
    p.name.toLocaleLowerCase().includes(search),
  );
  const writable = organisation.status === "active";
  return (
    <>
      <Link className="back-link" href="/benefits">
        ← {d.back}
      </Link>
      <PageHeader title={d.settings} description={d.providerHelp} />
      <p className="notice">{d.connectionHelp}</p>
      <form action="/benefits/settings" className="time-filters">
        <label className="field">
          <span>{d.name}</span>
          <input type="search" name="q" defaultValue={search} maxLength={100} />
        </label>
        <button className="button secondary">{d.filter}</button>
      </form>
      {(filteredBenefits.length > 100 || filteredProviders.length > 100) && (
        <p className="time-help">{d.catalogueLimit}</p>
      )}
      <div className="time-settings-grid">
        <section className="card time-padding">
          <h2>{d.providers}</h2>
          {filteredProviders.slice(0, 100).map((p) => (
            <details key={p.id} className="time-setting-row">
              <summary>
                {p.name} · {p.active ? d.enabled : d.disabledLabel}
              </summary>
              {!benefitsProvider(p.adapter_key).status().connected && (
                <p className="time-help">{d.notConnected}</p>
              )}
              {writable && <ProviderForm provider={p} locale={locale} />}
            </details>
          ))}
          {!providers.length && <p className="time-help">{d.none}</p>}
          {writable && (
            <details className="time-setting-row">
              <summary>+ {d.addProvider}</summary>
              <ProviderForm locale={locale} />
            </details>
          )}
        </section>
        <section className="card time-padding">
          <h2>{d.title}</h2>
          <p className="time-help">{d.configuredHelp}</p>
          {filteredBenefits.slice(0, 100).map((b) => (
            <details key={b.id} className="time-setting-row">
              <summary>
                {b.name} · {d[b.model]} ·{" "}
                {b.active ? d.enabled : d.disabledLabel}
              </summary>
              <p className="time-help">
                {providers.find((p) => p.id === b.provider_id)?.name} ·{" "}
                {moneyLabel(b.amount, locale)}
              </p>
              {writable && (
                <BenefitForm
                  benefit={b}
                  providers={providers}
                  locale={locale}
                />
              )}
            </details>
          ))}
          {!benefits.length && <p className="time-help">{d.none}</p>}
          {writable && !!providers.length && (
            <details className="time-setting-row">
              <summary>+ {d.addBenefit}</summary>
              <BenefitForm providers={providers} locale={locale} />
            </details>
          )}
        </section>
      </div>
    </>
  );
}
