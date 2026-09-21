import type { AttendanceDay } from "./time-types";
export const todayInRomania = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const singleParam = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";
export function monthParam(value: string) {
  return /^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : todayInRomania().slice(0, 7);
}
export function monthDays(month: string) {
  const [year, index] = month.split("-").map(Number);
  return Array.from(
    { length: new Date(Date.UTC(year, index, 0)).getUTCDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
export function attendanceTotals(rows: AttendanceDay[]) {
  return {
    working: rows.filter((r) => Number(r.planned_hours) > 0).length,
    worked: rows.filter((r) => Number(r.worked_hours) > 0).length,
    hours: rows.reduce((total, r) => total + Number(r.worked_hours ?? 0), 0),
    annual: rows.filter((r) => r.category === "annual").length,
    medical: rows.filter((r) => r.category === "medical").length,
    unpaid: rows.filter((r) => r.category === "unpaid").length,
    other: rows.filter((r) => r.category === "other").length,
    missing: rows.filter((r) => Number(r.planned_hours) > 0 && !r.recorded)
      .length,
  };
}
