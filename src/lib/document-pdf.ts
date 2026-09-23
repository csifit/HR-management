import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let fontBytes: Promise<Buffer> | undefined;
export class UnsupportedPdfText extends Error {}
export type PdfInput = {
  locale: "ro" | "en";
  brandName: string;
  title: string;
  template: "summary" | "letter" | "payslip";
  body: string;
  company: { name: string; cui: string; address: string };
  employee: {
    name: string;
    email: string;
    job: string;
    department: string;
    workplace: string;
    start: string;
    status: string;
  };
  generatedAt: Date;
};
export async function generateEmployeePdf(
  input: PdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  fontBytes ??= readFile(
    path.join(process.cwd(), "assets/fonts/NotoSans-Regular.ttf"),
  );
  const font = await pdf.embedFont(await fontBytes, { subset: true });
  const chars = new Set(font.getCharacterSet());
  const clean = (text: string) => {
    const s = text
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ");
    for (const c of s)
      if (c !== "\n" && !chars.has(c.codePointAt(0)!))
        throw new UnsupportedPdfText("Unsupported PDF character");
    return s;
  };
  const ro = input.locale === "ro";
  const payslip = input.template === "payslip";
  const W = 595.28,
    H = 841.89,
    margin = 48,
    width = W - 2 * margin;
  const ink = rgb(0.12, 0.18, 0.23),
    muted = rgb(0.36, 0.42, 0.47),
    accent = rgb(0.1, 0.39, 0.35);
  const wrap = (value: string, size: number, maxWidth = width) => {
    const lines: string[] = [];
    for (const paragraph of clean(value).split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/)) {
        if (!word) continue;
        if (
          font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <=
          maxWidth
        )
          line = line ? `${line} ${word}` : word;
        else {
          if (line) lines.push(line);
          line = "";
          for (const c of word) {
            if (font.widthOfTextAtSize(line + c, size) > maxWidth) {
              lines.push(line);
              line = "";
            }
            line += c;
          }
        }
      }
      lines.push(line);
    }
    return lines;
  };
  let page = pdf.addPage([W, H]),
    y = H - margin;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - margin;
  };
  const paragraph = (value: string, size = 11, color = ink, gap = 10) => {
    for (const line of wrap(value, size)) {
      if (y - size < 76) newPage();
      page.drawText(line, { x: margin, y: y - size, font, size, color });
      y -= size * (payslip ? 1.4 : 1.55);
    }
    y -= gap;
  };
  paragraph(input.company.name, 18, accent, 4);
  paragraph(
    `CUI: ${input.company.cui}${input.company.address ? ` | ${input.company.address}` : ""}`,
    9,
    muted,
    payslip ? 10 : 18,
  );
  paragraph(input.title, payslip ? 20 : 23, ink, 8);
  paragraph(
    `${ro ? "Data generării" : "Generated on"}: ${new Intl.DateTimeFormat(ro ? "ro-RO" : "en-GB", { dateStyle: "long", timeZone: "Europe/Bucharest" }).format(input.generatedAt)}`,
    9,
    muted,
    payslip ? 12 : 20,
  );
  const e = input.employee;
  paragraph(`${ro ? "Angajat" : "Employee"}: ${e.name}`, 13, accent, 7);
  for (const [label, value] of [
    ["Email", e.email],
    [ro ? "Funcție" : "Job title", e.job],
    [ro ? "Departament" : "Department", e.department],
    ...(input.template !== "payslip"
      ? [
          [ro ? "Loc de muncă" : "Workplace", e.workplace],
          [ro ? "Data începerii" : "Start date", e.start],
        ]
      : []),
    ...(input.template === "summary"
      ? [[ro ? "Stare în aplicație" : "Status in application", e.status]]
      : []),
  ])
    paragraph(`${label}: ${value}`, 10, ink, 3);
  y -= payslip ? 8 : 18;
  if (input.template !== "summary")
    paragraph(input.body, payslip ? 9.5 : 11, ink, 16);
  else
    paragraph(
      ro
        ? "Fișă informativă generată din datele disponibile în aplicație. Nu înlocuiește un contract de muncă sau o adeverință semnată."
        : "Information summary generated from the records in the application. It does not replace an employment contract or a signed certificate.",
      10,
      muted,
      16,
    );
  paragraph(
    ro
      ? "Document generat electronic, fără semnătură electronică."
      : "Electronically generated document without an electronic signature.",
    9,
    muted,
  );
  const pages = pdf.getPages();
  const footer = clean(input.brandName);
  const footerSize = Math.min(
    8,
    (8 * width) / Math.max(width, font.widthOfTextAtSize(footer, 8) + 90),
  );
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: margin, y: 51 },
      end: { x: W - margin, y: 51 },
      thickness: 0.5,
      color: rgb(0.82, 0.86, 0.85),
    });
    p.drawText(footer, {
      x: margin,
      y: 34,
      font,
      size: footerSize,
      color: muted,
    });
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: W - margin - 35,
      y: 34,
      font,
      size: 8,
      color: muted,
    });
  });
  pdf.setTitle(clean(input.title));
  pdf.setAuthor(clean(input.company.name));
  pdf.setProducer(clean(input.brandName));
  pdf.setCreationDate(input.generatedAt);
  pdf.setModificationDate(input.generatedAt);
  return pdf.save();
}

export async function isReadablePdf(bytes: Uint8Array): Promise<boolean> {
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return false;
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    return pdf.getPageCount() > 0;
  } catch {
    return false;
  }
}
