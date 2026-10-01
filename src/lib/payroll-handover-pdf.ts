import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { UnsupportedPdfText } from "./document-pdf.ts";
import { payrollHandoverTotals } from "./payroll-handover.ts";
import { payrollSettlementDictionary } from "./payroll-settlement-i18n.ts";
import type {
  PayrollHandoverPayload,
  PayrollMoneyKey,
} from "./payroll-handover-types";

let fontBytes: Promise<Buffer> | undefined;

/** A printable review of approved snapshots. No payroll is recalculated here. */
export async function generatePayrollHandoverPdf(
  payload: PayrollHandoverPayload,
  brandName: string,
): Promise<Uint8Array> {
  const totals = payrollHandoverTotals(payload);
  const preparedAt = new Date(payload.prepared_at);
  const approvedAt = new Date(payload.run.approved_at);
  if (
    !Number.isFinite(preparedAt.getTime()) ||
    !Number.isFinite(approvedAt.getTime())
  )
    throw new Error(
      "Valid handover preparation and approval dates are required",
    );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  fontBytes ??= readFile(
    path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
  );
  const font = await pdf.embedFont(await fontBytes, { subset: true });
  const characters = new Set(font.getCharacterSet());
  const clean = (value: string) => {
    const text = value
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, " ");
    for (const character of text)
      if (character !== "\n" && !characters.has(character.codePointAt(0)!))
        throw new UnsupportedPdfText("Unsupported PDF character");
    return text;
  };
  const ro = payload.locale === "ro";
  const date = (value: Date) =>
    new Intl.DateTimeFormat(ro ? "ro-RO" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Bucharest",
    }).format(value);
  const money = (value: number) =>
    new Intl.NumberFormat(ro ? "ro-RO" : "en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const W = 841.89,
    H = 595.28,
    margin = 34,
    width = W - margin * 2,
    bottom = 80;
  const ink = rgb(0.12, 0.18, 0.23),
    muted = rgb(0.36, 0.42, 0.47);
  const accent = rgb(0.1, 0.39, 0.35),
    lineColor = rgb(0.82, 0.87, 0.85);
  const pale = rgb(0.95, 0.97, 0.96),
    warningColor = rgb(0.49, 0.29, 0.06);
  const title = ro ? "Predare către contabilitate" : "Accountant handover";
  const period = `${payload.run.month.slice(0, 7)} | ${ro ? "Revizia aprobată" : "Approved revision"} ${payload.run.revision}`;
  const warning = [
    payload.is_historical
      ? ro
        ? `REVIZIE ISTORICĂ. Ultima revizie aprobată: ${payload.latest_approved_revision}.`
        : `HISTORICAL REVISION. Latest approved revision: ${payload.latest_approved_revision}.`
      : "",
    payload.has_open_correction
      ? ro
        ? "Există o corecție în lucru. Verificați înainte de utilizare."
        : "A correction draft is open. Review before use."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const wrap = (value: string, size: number, maxWidth: number) => {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        if (!word) continue;
        const combined = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(combined, size) <= maxWidth) {
          line = combined;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
          if (font.widthOfTextAtSize(line + character, size) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  // Only the repeating brand label is shortened; employee and contract fields wrap in full.
  const shortBrand = (() => {
    let value = clean(brandName).replace(/\n/g, " ");
    if (font.widthOfTextAtSize(value, 10) <= width - 250) return value;
    while (value && font.widthOfTextAtSize(`${value}...`, 10) > width - 250)
      value = Array.from(value).slice(0, -1).join("");
    return `${value}...`;
  })();
  let page = pdf.addPage([W, H]),
    y = 0;
  const text = (
    value: string,
    x: number,
    baseline: number,
    size = 9,
    color = ink,
  ) => page.drawText(clean(value), { x, y: baseline, size, font, color });
  const rightText = (
    value: string,
    right: number,
    baseline: number,
    size = 9,
    color = ink,
  ) =>
    text(
      value,
      right - font.widthOfTextAtSize(clean(value), size),
      baseline,
      size,
      color,
    );
  const pageHeading = (section: string, first = false) => {
    if (!first) page = pdf.addPage([W, H]);
    page.drawRectangle({
      x: margin,
      y: H - 29,
      width,
      height: 3,
      color: accent,
    });
    text(shortBrand, margin, H - 48, 10, accent);
    rightText(
      ro
        ? "CONFIDENȚIAL - HR / CONTABILITATE"
        : "CONFIDENTIAL - HR / ACCOUNTING",
      W - margin,
      H - 48,
      9,
      muted,
    );
    text(section, margin, H - 79, 19);
    text(period, margin, H - 99, 10, muted);
    y = H - 119;
    if (warning) {
      for (const warningLine of wrap(warning, 9, width)) {
        text(warningLine, margin, y - 9, 9, warningColor);
        y -= 13;
      }
      y -= 7;
    }
  };
  pageHeading(title, true);
  const ensure = (height: number) => {
    if (y - height < bottom) pageHeading(title);
  };
  const paragraph = (value: string, size = 9, color = ink, gap = 5) => {
    for (const paragraphLine of wrap(value, size, width)) {
      ensure(size * 1.4);
      text(paragraphLine, margin, y - size, size, color);
      y -= size * 1.4;
    }
    y -= gap;
  };
  paragraph(payload.company.name, 14, accent, 3);
  paragraph(
    `CUI: ${payload.company.cui}${payload.company.address ? ` | ${payload.company.address}` : ""}`,
    9,
    muted,
    6,
  );
  paragraph(
    `${ro ? "Pregătit la" : "Prepared on"}: ${date(preparedAt)} | ${ro ? "Aprobat la" : "Approved on"}: ${date(approvedAt)}`,
    9,
    muted,
    6,
  );
  paragraph(
    ro
      ? `${payload.items.length} angajați incluși în această revizie. Totalurile de mai jos privesc exclusiv acești angajați. Sume în RON.`
      : `${payload.items.length} employees included in this revision. Totals below cover these employees only. All amounts in RON.`,
    9,
    ink,
    9,
  );

  const metrics: [PayrollMoneyKey, string][] = [
    ["cashGross", ro ? "Brut în numerar" : "Cash gross"],
    [
      "meals",
      ro ? "Tichete de masă (fără numerar)" : "Meal vouchers (non-cash)",
    ],
    ["cas", ro ? "CAS reținut de la angajați" : "Employee CAS"],
    ["cass", ro ? "CASS reținut de la angajați" : "Employee CASS"],
    ["incomeTax", ro ? "Impozit pe venit" : "Income tax"],
    ["net", ro ? "Net în numerar înainte de avans" : "Cash net before advance"],
    ["advance", ro ? "Avansuri deja plătite" : "Advances already paid"],
    ["payable", ro ? "Rest de plată în numerar" : "Remaining cash payable"],
    ["employerCas", ro ? "Diferență CAS - angajator" : "Employer CAS top-up"],
    [
      "employerCass",
      ro ? "Diferență CASS - angajator" : "Employer CASS top-up",
    ],
    ["cam", "CAM"],
    [
      "employerCost",
      ro ? "Cost angajator, cu tichete" : "Employer cost, including vouchers",
    ],
  ];
  ensure(6 * 31 + 9);
  const columnWidth = (width - 16) / 2;
  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 2; column++) {
      const [key, label] = metrics[row * 2 + column];
      const x = margin + column * (columnWidth + 16);
      page.drawRectangle({
        x,
        y: y - 29,
        width: columnWidth,
        height: 29,
        color: pale,
      });
      const labels = wrap(label, 9, columnWidth - 127);
      labels.forEach((labelLine, i) =>
        text(
          labelLine,
          x + 9,
          y - 12 - i * 11,
          9,
          key === "payable" ? accent : ink,
        ),
      );
      rightText(
        money(totals[key]),
        x + columnWidth - 9,
        y - 19,
        11,
        key === "payable" ? accent : ink,
      );
    }
    y -= 31;
  }
  y -= 10;
  paragraph(
    ro
      ? "Situație pentru verificarea contabilului, bazată pe calculele salvate și aprobate. Nu reprezintă un ordin de plată, declarația D112 sau un fișier de import SAGA."
      : "For accountant review, using saved approved calculations. This is not a payment order, a D112 filing or a SAGA import file.",
    9,
    ink,
    5,
  );
  paragraph(
    ro
      ? "Contribuțiile și costurile agregate sunt orientative pentru verificare; nu reprezintă obligațiile declarative finale ale angajatorului. Tichetele sunt incluse în cost, dar nu în restul de plată în numerar."
      : "Aggregated contributions and costs are indicative review figures, not the employer's final filing liabilities. Vouchers are included in cost but excluded from remaining cash payable.",
    9,
    muted,
    5,
  );
  paragraph(
    `${ro ? "Reguli salvate" : "Saved rules"}: ${[...new Set(payload.items.map((item) => item.result.rules))].join(", ")}`,
    9,
    muted,
    0,
  );

  type Column = {
    title: string;
    width: number;
    right?: boolean;
    value: (item: PayrollHandoverPayload["items"][number]) => string;
  };
  const table = (
    section: string,
    intro: string,
    columns: Column[],
    sourceItems = payload.items,
  ) => {
    let headerHeight = 0;
    const headerLines = columns.map((column) =>
      wrap(column.title, 9, column.width - 12),
    );
    headerHeight =
      Math.max(...headerLines.map((lines) => lines.length)) * 12 + 14;
    const start = () => {
      pageHeading(section);
      for (const introLine of wrap(intro, 9, width)) {
        text(introLine, margin, y - 9, 9, muted);
        y -= 13;
      }
      y -= 9;
      page.drawRectangle({
        x: margin,
        y: y - headerHeight,
        width,
        height: headerHeight,
        color: accent,
      });
      let x = margin;
      columns.forEach((column, index) => {
        headerLines[index].forEach((headerLine, lineIndex) => {
          if (column.right)
            rightText(
              headerLine,
              x + column.width - 6,
              y - 16 - lineIndex * 12,
              9,
              rgb(1, 1, 1),
            );
          else
            text(headerLine, x + 6, y - 16 - lineIndex * 12, 9, rgb(1, 1, 1));
        });
        x += column.width;
      });
      y -= headerHeight;
    };
    start();
    sourceItems.forEach((item, itemIndex) => {
      const lines = columns.map((column) =>
        wrap(column.value(item), 9, column.width - 12),
      );
      const count = Math.max(...lines.map((cell) => cell.length));
      let consumed = 0;
      // Exceptionally long labels continue on the next page instead of being clipped.
      while (consumed < count) {
        const rowHeight = Math.max(24, (count - consumed) * 12 + 12);
        if (rowHeight > y - bottom && consumed === 0 && y < H - 235) start();
        const capacity = Math.floor((y - bottom - 12) / 12);
        if (capacity < 1) {
          start();
          continue;
        }
        const shown = Math.min(count - consumed, capacity);
        const height = Math.max(24, shown * 12 + 12);
        if (itemIndex % 2 === 0)
          page.drawRectangle({
            x: margin,
            y: y - height,
            width,
            height,
            color: pale,
          });
        let x = margin;
        columns.forEach((column, index) => {
          lines[index]
            .slice(consumed, consumed + shown)
            .forEach((cellLine, lineIndex) => {
              if (column.right)
                rightText(
                  cellLine,
                  x + column.width - 6,
                  y - 16 - lineIndex * 12,
                );
              else text(cellLine, x + 6, y - 16 - lineIndex * 12);
            });
          x += column.width;
        });
        y -= height;
        page.drawLine({
          start: { x: margin, y },
          end: { x: W - margin, y },
          thickness: 0.4,
          color: lineColor,
        });
        consumed += shown;
        if (consumed < count) start();
      }
    });
  };
  const amountColumn = (
    key: PayrollMoneyKey,
    label: string,
    width: number,
  ): Column => ({
    title: label,
    width,
    right: true,
    value: (item) => money(item.result[key]),
  });
  const employeeLabel = (item: PayrollHandoverPayload["items"][number]) => {
    const p = item.input.period;
    return (
      item.employee_name +
      (p
        ? `\n${p.start} - ${p.end}\n${p.employedWorkingDays}/${p.monthWorkingDays} ${ro ? "zile lucrătoare" : "working days"}`
        : "") +
      (item.input.settlement
        ? `\n${ro ? "Lichidare: vezi detalierea" : "Settlement: see breakdown"}`
        : "")
    );
  };
  table(
    ro ? "Salarii și rețineri" : "Pay and employee deductions",
    ro
      ? "RON. Netul este suma înaintea avansului deja plătit; restul de plată exclude tichetele de masă."
      : "RON. Net is before the advance already paid; remaining cash payable excludes meal vouchers.",
    [
      {
        title: ro ? "Angajat" : "Employee",
        width: 162,
        value: employeeLabel,
      },
      {
        title: ro ? "Contract" : "Contract",
        width: width - 162 - 76 * 7,
        value: (item) => item.contract_number,
      },
      amountColumn("cashGross", ro ? "Brut numerar" : "Cash gross", 76),
      amountColumn("cas", "CAS", 76),
      amountColumn("cass", "CASS", 76),
      amountColumn("incomeTax", ro ? "Impozit" : "Income tax", 76),
      amountColumn("net", ro ? "Net numerar" : "Cash net", 76),
      amountColumn("advance", ro ? "Avans plătit" : "Advance paid", 76),
      amountColumn("payable", ro ? "Rest de plată" : "Cash payable", 76),
    ],
  );
  table(
    ro ? "Tichete și costuri ale angajatorului" : "Vouchers and employer costs",
    ro
      ? "RON. Diferențele CAS/CASS sunt suportate de angajator. Totaluri orientative pentru verificare, nu obligații declarative finale."
      : "RON. CAS/CASS top-ups are employer-funded. Indicative review figures, not final employer filing liabilities.",
    [
      {
        title: ro ? "Angajat" : "Employee",
        width: 190,
        value: employeeLabel,
      },
      {
        title: "Contract",
        width: width - 190 - 96 * 5,
        value: (item) => item.contract_number,
      },
      amountColumn("meals", ro ? "Tichete de masă" : "Meal vouchers", 96),
      amountColumn("employerCas", ro ? "Diferență CAS" : "CAS top-up", 96),
      amountColumn("employerCass", ro ? "Diferență CASS" : "CASS top-up", 96),
      amountColumn("cam", "CAM", 96),
      amountColumn(
        "employerCost",
        ro ? "Cost cu tichete" : "Cost with vouchers",
        96,
      ),
    ],
  );
  const settlements = payload.items.filter(
    (item) => item.input.settlement && item.result.settlement,
  );
  if (settlements.length) {
    const sd = payrollSettlementDictionary(payload.locale);
    table(
      sd.title,
      ro
        ? "RON. Componente deja incluse în brut, taxe și net; nu se adună din nou. Soldul și tariful au fost aprobate extern."
        : "RON. Components already included in gross, taxes and net; do not add again. Balance and rate were approved externally.",
      [
        {
          title: ro ? "Angajat / contract" : "Employee / contract",
          width: 160,
          value: (item) =>
            `${item.employee_name}\n${item.contract_number}\n${item.input.period!.end}`,
        },
        {
          title: ro ? "Zile concediu" : "Unused days",
          width: 80,
          right: true,
          value: (item) => String(item.input.settlement!.days),
        },
        {
          title: ro ? "Tarif aprobat/zi" : "Approved rate/day",
          width: 110,
          right: true,
          value: (item) => money(item.input.settlement!.dailyGross),
        },
        {
          title: ro ? "Concediu neefectuat (brut)" : "Unused leave (gross)",
          width: 110,
          right: true,
          value: (item) => money(item.result.settlement!.unusedLeaveGross),
        },
        {
          title: ro ? "Alte sume brute" : "Other gross pay",
          width: 110,
          right: true,
          value: (item) => money(item.result.settlement!.otherGross),
        },
        {
          title: ro
            ? "Referințe de verificare / aprobare"
            : "Review / approval references",
          width: width - 570,
          value: (item) =>
            [
              `${ro ? "Sold" : "Balance"}: ${item.input.settlement!.balanceReference || "-"}`,
              `${ro ? "Tarif" : "Rate"}: ${item.input.settlement!.rateReference || "-"}`,
              `${ro ? "Alte sume" : "Other pay"}: ${item.input.settlement!.otherReference || "-"}`,
            ].join("\n"),
        },
      ],
      settlements,
    );
  }
  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    page = pdfPage;
    page.drawLine({
      start: { x: margin, y: 65 },
      end: { x: W - margin, y: 65 },
      thickness: 0.5,
      color: lineColor,
    });
    text(
      `${ro ? "Stat" : "Run"}: ${payload.run.id} | r${payload.run.revision}`,
      margin,
      48,
      9,
      muted,
    );
    text(`Export: ${payload.export_id}`, margin, 33, 9, muted);
    rightText(
      `${ro ? "Pagina" : "Page"} ${index + 1} / ${pages.length}`,
      W - margin,
      33,
      9,
      muted,
    );
  });
  pdf.setTitle(
    `${title} - ${payload.run.month.slice(0, 7)} - r${payload.run.revision}`,
  );
  pdf.setAuthor(clean(payload.company.name));
  pdf.setProducer(clean(brandName));
  pdf.setSubject(
    `${payload.format_version} | ${payload.export_id} | ${payload.run.id}`,
  );
  pdf.setCreationDate(preparedAt);
  pdf.setModificationDate(preparedAt);
  return pdf.save();
}
