import { zipSync, strToU8 } from "fflate";
import type { PrivacyExportPayload } from "./privacy-types";

export const MAX_PRIVACY_FILE_BYTES = 50 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (value: unknown) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function recordsHtml(payload: PrivacyExportPayload) {
  const value = (v: unknown) =>
    escapeHtml(
      typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : v,
    );
  const sections = Object.entries(payload.data)
    .map(([key, data]) => {
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return `<section><h2>${escapeHtml(key.replaceAll("_", " "))} (${rows.length})</h2><div class="scroll"><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c.replaceAll("_", " "))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${value(row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Employee data / Date angajat</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#172e35;margin:32px auto;padding:0 20px;max-width:1400px}h1,h2{color:#12695f}section{margin:30px 0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #cbd6d7;text-align:left;vertical-align:top;white-space:pre-wrap;min-width:100px;max-width:440px;overflow-wrap:anywhere}th{background:#edf6f3}p{max-width:900px}</style><h1>Employee data / Date angajat</h1><p>HR review copy / Copie pentru verificare HR. Review other people's information before delivery. Verifică informațiile altor persoane înainte de comunicare.</p><p>${escapeHtml(payload.prepared_at)} · ${escapeHtml(payload.export_id)}</p><p>Calculated attendance / Pontaj calculat: ${escapeHtml(payload.attendance_from)} – ${escapeHtml(payload.attendance_to)}. See README.txt and manifest.json for scope and omitted records / Vezi README.txt și manifest.json pentru limite și evidențe neincluse.</p>${sections}</html>`;
}
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");

// Downloaded only by the authorised HR browser. No public URLs or persisted ZIP.
export async function buildPrivacyArchive(
  payload: PrivacyExportPayload,
  download: (path: string) => Promise<Uint8Array>,
) {
  if (
    !uuid.test(payload.organisation_id) ||
    !uuid.test(payload.export_id) ||
    payload.files.length > 50 ||
    new Set(payload.files.map((f) => f.id)).size !== payload.files.length
  )
    throw new Error("Invalid export manifest");
  let total = 0;
  for (const file of payload.files) {
    if (
      !uuid.test(file.id) ||
      file.object_path !== `${payload.organisation_id}/${file.id}.pdf` ||
      !Number.isInteger(file.byte_size) ||
      file.byte_size < 5 ||
      file.byte_size > 10 * 1024 * 1024
    )
      throw new Error("Invalid export file");
    total += file.byte_size;
  }
  if (total > MAX_PRIVACY_FILE_BYTES) throw new Error("Export too large");
  const records = strToU8(JSON.stringify(payload.data, null, 2));
  // Formatting can expand the compact server JSON; keep a separate browser bound.
  if (records.length > 4 * 1024 * 1024) throw new Error("Export too large");
  const files: Record<string, Uint8Array> = {
    "employee-data.json": records,
    "employee-data.html": strToU8(recordsHtml(payload)),
  };
  const manifestFiles = [];
  for (const file of payload.files) {
    const bytes = await download(file.object_path);
    if (bytes.length !== file.byte_size)
      throw new Error("Document transfer incomplete");
    const name = `documents/${file.id}.pdf`;
    files[name] = bytes;
    manifestFiles.push({
      id: file.id,
      version: file.version,
      title: file.title,
      file: name,
      bytes: bytes.length,
      sha256: await digest(bytes),
    });
  }
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        format: "HRConnector-employee-review-v1",
        export_id: payload.export_id,
        prepared_at: payload.prepared_at,
        request_id: payload.request_id,
        organisation_id: payload.organisation_id,
        employee_id: payload.employee_id,
        calculated_attendance: {
          from: payload.attendance_from,
          to: payload.attendance_to,
          historical_snapshot: false,
        },
        records: {
          file: "employee-data.json",
          bytes: records.length,
          sha256: await digest(records),
        },
        review_view: {
          file: "employee-data.html",
          bytes: files["employee-data.html"].length,
          sha256: await digest(files["employee-data.html"]),
        },
        selected_documents: manifestFiles,
        review_required: [
          "HR review copy, not proof of response or delivery. Check third-party data and free text before sharing.",
          "Only selected ready PDFs are attached. The document inventory also lists omitted and pending documents.",
          "Recorded HR data cover the stored history. Calculated attendance covers only the selected dates and uses current source records.",
          "Audit history, privacy-case internal notes, support records, Auth-provider records, calendar exception labels and external/vendor copies require separate review.",
          "Supply applicable Article 15 information, retention explanations, redactions and additional records separately. Not a complete rights response or erasure operation.",
        ],
      },
      null,
      2,
    ),
  );
  files["README.txt"] = strToU8(
    "HR REVIEW PACKAGE / PACHET PENTRU VERIFICARE HR\n\n" +
      "Open employee-data.html in a browser to review the records. employee-data.json contains the structured version. manifest.json describes scope, selected PDFs and SHA-256 hashes. Document filenames use IDs to avoid exposing names in paths.\n" +
      "Review all free text and PDFs for information about other people. Add the controller's response and required supplementary information. Use an approved secure delivery method and record the actual response in the request register. This ZIP is not encrypted. Store it securely and remove working copies according to your approved retention procedure.\n\n" +
      "Deschide employee-data.html în browser pentru verificare. employee-data.json conține versiunea structurată. manifest.json descrie obiectul exportului, PDF-urile selectate și amprentele SHA-256.\n" +
      "Verifică textul liber și PDF-urile pentru informații despre alte persoane. Adaugă răspunsul operatorului și informațiile suplimentare necesare. Folosește comunicarea securizată aprobată și înregistrează răspunsul efectiv în registru. ZIP-ul nu este criptat. Păstrează-l securizat și elimină copiile de lucru conform procedurii aprobate.\n",
  );
  return zipSync(files, { level: 0 });
}
