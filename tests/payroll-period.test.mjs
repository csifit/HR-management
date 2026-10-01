import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePayroll, payrollSchema } from "../src/lib/payroll.ts";
import {
  calculatePayrollRun,
  earnedBasicPay,
  payrollPeriodSchema,
  payrollRunInputSchema,
  PartialPayrollReliefReview,
} from "../src/lib/payroll-period.ts";

const base = {
  month: "2026-09",
  basic: 10000,
  bonus: 0,
  primary: "yes",
  dependants: 0,
  young: "no",
  children: 0,
  reduced: "no",
  standard: "on",
};
const starterPeriod = {
  start: "2026-09-16",
  end: "2026-09-30",
  monthWorkingDays: 22,
  employedWorkingDays: 11,
  monthCalendarDays: 30,
  employedCalendarDays: 15,
};
const starter = {
  ...base,
  period: starterPeriod,
  deductionEmployer: "this",
  deductionReference: "Primary-first-employer-09",
};
function values(result, keys) {
  return Object.fromEntries(keys.map((key) => [key, result[key]]));
}
const amountKeys = [
  "cashGross",
  "cas",
  "cass",
  "personalDeduction",
  "incomeTax",
  "net",
  "contributionFloor",
  "employerCas",
  "employerCass",
  "cam",
  "employerCost",
];

test("September starter earns half of monthly basic with full monthly deduction bands", () => {
  const result = calculatePayrollRun(starter);
  assert.equal(result.rules, "RO-2026-monthly-v4");
  // 5,000 gross; 13% of the 4,325 reference minimum rounds to 562 deduction.
  assert.deepEqual(values(result, amountKeys), {
    cashGross: 5000,
    cas: 1250,
    cass: 500,
    personalDeduction: 562,
    incomeTax: 269,
    net: 2981,
    contributionFloor: 2063,
    employerCas: 0,
    employerCass: 0,
    cam: 113,
    employerCost: 5113,
  });
});

test("June leaver uses nine of 21 working days, retaining earned bani", () => {
  const result = calculatePayrollRun({
    ...starter,
    month: "2026-06",
    period: {
      start: "2026-06-01",
      end: "2026-06-12",
      monthWorkingDays: 21,
      employedWorkingDays: 9,
      monthCalendarDays: 30,
      employedCalendarDays: 12,
    },
  });
  // June 1 is a holiday: June 2–5 and June 8–12 supply nine working days.
  assert.deepEqual(values(result, amountKeys), {
    cashGross: 4285.71,
    cas: 1071,
    cass: 429,
    personalDeduction: 709,
    incomeTax: 208,
    net: 2577.71,
    contributionFloor: 1607,
    employerCas: 0,
    employerCass: 0,
    cam: 96,
    employerCost: 4381.71,
  });
});

test("fractional part-time minimum caps deductions without reducing employee net by floor top-ups", () => {
  const result = calculatePayrollRun({
    ...starter,
    basic: "2162,50",
    hours: 4,
  });
  assert.deepEqual(values(result, amountKeys), {
    cashGross: 1081.25,
    cas: 270,
    cass: 108,
    personalDeduction: 703.25,
    incomeTax: 0,
    net: 703.25,
    contributionFloor: 2063,
    employerCas: 246,
    employerCass: 98,
    cam: 24,
    employerCost: 1449.25,
  });
  const exempt = calculatePayrollRun({
    ...starter,
    basic: 2162.5,
    hours: 4,
    floorException: "student",
    evidence: "Student-certificate-09",
  });
  assert.equal(exempt.net, 703.25);
  assert.equal(exempt.contributionFloor, 0);
  assert.equal(exempt.employerCas, 0);
  assert.equal(exempt.employerCass, 0);
  assert.equal(exempt.employerCost, 1105.25);
  assert.throws(() =>
    calculatePayrollRun({ ...starter, basic: 2162.49, hours: 4 }),
  );
});

test("July contribution floor rounds to whole lei before applying CAS", () => {
  const result = calculatePayrollRun({
    ...starter,
    month: "2026-07",
    basic: 2162.5,
    hours: 4,
    period: {
      start: "2026-07-01",
      end: "2026-07-22",
      monthWorkingDays: 23,
      employedWorkingDays: 16,
      monthCalendarDays: 31,
      employedCalendarDays: 22,
    },
  });
  // 4,125 * 16/23 = 2,869.565... -> 2,870; CAS on that floor is 718, not 717.
  assert.deepEqual(values(result, amountKeys), {
    cashGross: 1504.35,
    cas: 376,
    cass: 150,
    personalDeduction: 865,
    incomeTax: 11,
    net: 967.35,
    contributionFloor: 2870,
    employerCas: 342,
    employerCass: 137,
    cam: 34,
    employerCost: 2017.35,
  });
});

test("basic pay rounds half a ban up while actual cash bonus is never prorated", () => {
  assert.equal(
    earnedBasicPay(
      payrollRunInputSchema.parse({ ...starter, basic: 10000.01 }),
    ),
    5000.01,
  );
  const result = calculatePayrollRun({ ...starter, bonus: 350.25 });
  assert.deepEqual(
    values(result, [
      "cashGross",
      "cas",
      "cass",
      "personalDeduction",
      "incomeTax",
      "net",
      "cam",
      "employerCost",
    ]),
    {
      cashGross: 5350.25,
      cas: 1338,
      cass: 535,
      personalDeduction: 411,
      incomeTax: 307,
      net: 3170.25,
      cam: 120,
      employerCost: 5470.25,
    },
  );
});

test("the earlier employer's monthly deduction suppresses all personal components, not primary status", () => {
  const facts = { ...starter, young: "yes", children: 1 };
  const first = calculatePayrollRun(facts);
  assert.deepEqual(
    values(first, [
      "personalDeduction",
      "youngDeduction",
      "childrenDeduction",
      "incomeTax",
      "net",
    ]),
    {
      personalDeduction: 562,
      youngDeduction: 649,
      childrenDeduction: 100,
      incomeTax: 194,
      net: 3056,
    },
  );
  const later = calculatePayrollRun({
    ...facts,
    deductionEmployer: "other",
    deductionReference: "Earlier-employer-09",
  });
  assert.deepEqual(
    values(later, [
      "personalDeduction",
      "youngDeduction",
      "childrenDeduction",
      "incomeTax",
      "net",
    ]),
    {
      personalDeduction: 0,
      youngDeduction: 0,
      childrenDeduction: 0,
      incomeTax: 325,
      net: 2925,
    },
  );
  // Vouchers remain allowed at primary employment when the earlier employer owns the deduction.
  assert.doesNotThrow(() =>
    calculatePayrollRun({
      ...facts,
      deductionEmployer: "other",
      meals: 100,
      mealsReference: "Issued-09",
    }),
  );
  for (const patch of [
    { deductionEmployer: undefined },
    { deductionReference: undefined },
    { deductionReference: "" },
    { deductionReference: "  " },
    { deductionEmployer: "other", deductionReference: "ab" },
    { primary: "no", deductionEmployer: "this" },
  ])
    assert.throws(() => calculatePayrollRun({ ...starter, ...patch }));
  assert.doesNotThrow(() =>
    calculatePayrollRun({
      ...starter,
      primary: "no",
      deductionEmployer: "other",
      deductionReference: "",
    }),
  );
});

test("monthly deduction is capped across basic, young and child amounts for a short period", () => {
  const result = calculatePayrollRun({
    ...starter,
    basic: 2162.5,
    hours: 4,
    young: "yes",
    children: 2,
  });
  assert.equal(result.personalDeduction, 703.25);
  assert.equal(result.youngDeduction, 0);
  assert.equal(result.childrenDeduction, 0);
  assert.equal(result.taxBase, 0);
  assert.equal(result.net, 703.25);
});

test("partial-month relief candidates stop for explicit review even when deductions belong elsewhere", () => {
  for (const deductionEmployer of ["this", "other"])
    assert.throws(
      () => calculatePayrollRun({ ...starter, basic: 4325, deductionEmployer }),
      (error) =>
        error instanceof PartialPayrollReliefReview &&
        /relief.*accountant review/i.test(error.message),
    );
  assert.throws(
    () => calculatePayrollRun({ ...starter, basic: 4325, bonus: 2437.5 }),
    PartialPayrollReliefReview,
  );
  assert.equal(
    calculatePayrollRun({ ...starter, basic: 4325, bonus: 2437.51 }).relief,
    0,
  );
  assert.equal(
    calculatePayrollRun({ ...starter, basic: 4325, reduced: "yes" }).relief,
    0,
  );
  assert.equal(
    calculatePayrollRun({
      ...starter,
      basic: 4325,
      primary: "no",
      deductionEmployer: "other",
    }).relief,
    0,
  );
  assert.equal(calculatePayrollRun({ ...starter, basic: 4325.01 }).relief, 0);
  assert.throws(
    () =>
      calculatePayrollRun({
        ...starter,
        month: "2026-06",
        basic: 4050,
        period: {
          start: "2026-06-01",
          end: "2026-06-12",
          monthWorkingDays: 21,
          employedWorkingDays: 9,
          monthCalendarDays: 30,
          employedCalendarDays: 12,
        },
      }),
    PartialPayrollReliefReview,
  );
});

test("period guards reject impossible dates, inconsistent counts and the wrong payroll month", () => {
  const invalid = [
    { start: "2026-09-31" },
    { start: "2025-09-16" },
    { start: "2026-09-30", end: "2026-09-16" },
    { start: "2026-08-16" },
    { end: "2026-10-01" },
    { employedCalendarDays: 14 },
    { monthCalendarDays: 31 },
    { employedWorkingDays: 0 },
    { monthWorkingDays: 0 },
    { employedCalendarDays: 0 },
    { monthCalendarDays: 0 },
    { employedWorkingDays: 23 },
    { employedWorkingDays: 16 },
    { monthWorkingDays: 31 },
    { employedWorkingDays: 11.5 },
    { start: "2026-09-01", employedCalendarDays: 30 },
    { unexpected: true },
  ];
  for (const patch of invalid)
    assert.equal(
      payrollPeriodSchema.safeParse({ ...starterPeriod, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
  assert.throws(() => calculatePayrollRun({ ...starter, month: "2026-08" }));
  assert.throws(() => calculatePayrollRun({ ...starter, period: null }));
  assert.throws(() => calculatePayrollRun({ ...starter, period: {} }));
});

test("legacy inputs preserve v3 while full-month v4 matches every monetary result", () => {
  assert.deepEqual(calculatePayrollRun(base), calculatePayroll(base));
  assert.equal(calculatePayrollRun(base).rules, "RO-2026-monthly-v3");
  assert.equal(earnedBasicPay(payrollSchema.parse(base)), 10000);
  assert.throws(() =>
    calculatePayrollRun({ ...base, deductionEmployer: "this" }),
  );
  assert.throws(() =>
    calculatePayrollRun({ ...base, deductionReference: "Unbound-reference" }),
  );
  const workdays = [18, 20, 22, 20, 20, 21, 23, 21, 22, 22, 20, 21];
  for (let month = 1; month <= 12; month++) {
    const monthText = `2026-${String(month).padStart(2, "0")}`;
    const calendarDays = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const minimum = month <= 6 ? 4050 : 4325;
    for (const patch of [
      {},
      { basic: minimum },
      { basic: minimum / 2, hours: 4 },
      {
        basic: minimum / 2,
        hours: 4,
        floorException: "student",
        evidence: "Evidence-2026",
      },
      {
        basic: 10000.1,
        bonus: 0.2,
        meals: 800.15,
        mealsReference: "Issued",
        advance: 500.25,
        advanceReference: "Paid",
      },
      { primary: "no" },
      { basic: minimum, young: "yes", children: 1 },
    ]) {
      const facts = { ...base, month: monthText, ...patch };
      const old = calculatePayroll(facts);
      const current = calculatePayrollRun({
        ...facts,
        period: {
          start: `${monthText}-01`,
          end: `${monthText}-${calendarDays}`,
          monthWorkingDays: workdays[month - 1],
          employedWorkingDays: workdays[month - 1],
          monthCalendarDays: calendarDays,
          employedCalendarDays: calendarDays,
        },
        deductionEmployer: facts.primary === "yes" ? "this" : "other",
        deductionReference: "",
      });
      assert.deepEqual(
        current,
        { ...old, rules: "RO-2026-monthly-v4" },
        `${monthText}: ${JSON.stringify(patch)}`,
      );
    }
  }
});

test("partial advances affect remaining cash only and must be covered by net cash", () => {
  const result = calculatePayrollRun({
    ...starter,
    advance: 500.25,
    advanceReference: "Paid-09",
  });
  assert.equal(result.net, 2981);
  assert.equal(result.payable, 2480.75);
  assert.equal(result.incomeTax, 269);
  assert.equal(
    calculatePayrollRun({
      ...starter,
      advance: 2981,
      advanceReference: "Paid-09",
    }).payable,
    0,
  );
  assert.throws(
    () =>
      calculatePayrollRun({
        ...starter,
        advance: 2981.01,
        advanceReference: "Paid-09",
      }),
    /cash pay/i,
  );
  assert.throws(() => calculatePayrollRun({ ...starter, advance: 1 }));
  assert.throws(
    () =>
      calculatePayrollRun({
        ...starter,
        basic: 600,
        hours: 1,
        meals: 100000,
        mealsReference: "Issued-09",
      }),
    /cash pay/i,
  );
  assert.throws(
    () => calculatePayrollRun({ ...starter, basic: 1000000, bonus: 1000000 }),
    /Gross limit/,
  );
});
