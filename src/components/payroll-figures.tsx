import { moneyLabel, type Locale } from "@/lib/i18n";
import { payrollDictionary, payrollRows } from "@/lib/payroll-i18n";
import type { PayrollResult } from "@/lib/payroll";
import { workflowDictionary } from "@/lib/workflow-i18n";

export const payrollHighlights = [
  "cashGross",
  "net",
  "payable",
  "employerCost",
] as const;
export function PayrollHighlights({
  amounts,
  locale,
}: {
  amounts: Pick<PayrollResult, (typeof payrollHighlights)[number]>;
  locale: Locale;
}) {
  const d = payrollDictionary(locale);
  return (
    <dl className="payroll-highlights">
      {payrollHighlights.map((key) => (
        <div key={key} className={key === "payable" ? "payroll-payable" : ""}>
          <dt>{d[key]}</dt>
          <dd>{moneyLabel(amounts[key], locale)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function PayrollFigures({
  result,
  locale,
}: {
  result: PayrollResult;
  locale: Locale;
}) {
  const d = payrollDictionary(locale);
  return (
    <>
      <PayrollHighlights amounts={result} locale={locale} />
      <details className="workflow-details">
        <summary>{workflowDictionary(locale).breakdown}</summary>
        <div className="table-scroll">
          <table>
            <tbody>
              {payrollRows.map((key) => (
                <tr key={key}>
                  <th>{d[key]}</th>
                  <td>{moneyLabel(result[key], locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
