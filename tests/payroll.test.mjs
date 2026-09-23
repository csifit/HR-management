import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePayroll } from "../src/lib/payroll.ts";
import { mailConfigSchema } from "../src/lib/mail-config.ts";
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
test("standard high salary separates employee deductions from employer contribution", () => {
  const p = calculatePayroll(base);
  assert.equal(p.cas, 2500);
  assert.equal(p.cass, 1000);
  assert.equal(p.incomeTax, 650);
  assert.equal(p.net, 5850);
  assert.equal(p.cam, 225);
  assert.equal(p.employerCost, 10225);
});
test("minimum wage and relief change at July 2026, with eligibility and earnings caps", () => {
  const jan = calculatePayroll({ ...base, month: "2026-01", basic: 4050 });
  assert.equal(jan.relief, 300);
  assert.equal(jan.personalDeduction, 810);
  assert.equal(jan.net, 2574);
  const jul = calculatePayroll({ ...base, month: "2026-07", basic: 4325 });
  assert.equal(jul.relief, 200);
  assert.equal(jul.personalDeduction, 865);
  assert.equal(jul.net, 2699);
  assert.equal(
    calculatePayroll({ ...base, basic: 4325, bonus: 275 }).relief,
    200,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 4325, bonus: 276 }).relief,
    0,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 4325, reduced: "yes" }).relief,
    0,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 4325, primary: "no" }).relief,
    0,
  );
});
test("personal deductions respect dependent bands, threshold and remaining taxable income", () => {
  assert.equal(
    calculatePayroll({ ...base, basic: 4325, dependants: 1 }).personalDeduction,
    1081,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 4375 }).personalDeduction,
    843,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 4376 }).personalDeduction,
    822,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 6325, dependants: 4 }).personalDeduction,
    1081,
  );
  assert.equal(
    calculatePayroll({ ...base, basic: 6326, dependants: 4 }).personalDeduction,
    0,
  );
  const young = calculatePayroll({ ...base, basic: 4325, young: "yes" });
  assert.equal(young.youngDeduction, 649);
  assert.equal(
    calculatePayroll({ ...base, basic: 6326, young: "yes" }).youngDeduction,
    0,
  );
  assert.equal(calculatePayroll({ ...base, children: 1 }).net, 5860);
  const large = calculatePayroll({
    ...base,
    basic: 4325,
    dependants: 4,
    young: "yes",
    children: 20,
  });
  assert.equal(large.taxBase, 0);
  assert.equal(
    large.personalDeduction + large.youngDeduction + large.childrenDeduction,
    large.contributionBase - large.cas - large.cass,
  );
});
test("unknown tax periods, unsupported declarations and inconsistent deductions are refused", () => {
  for (const patch of [
    { month: "2027-01" },
    { month: "2026-13" },
    { basic: 4050 },
    { basic: 4325.5 },
    { standard: "" },
    { dependants: 5 },
    { primary: "no", children: 1 },
    { basic: 1000000, bonus: 1 },
  ])
    assert.throws(() => calculatePayroll({ ...base, ...patch }));
});
test("mail configuration accepts only TLS SMTP ports and valid sender addresses", () => {
  const config = {
    host: "server.mxrouting.net",
    port: 465,
    user: "admin@mkdir.space",
    password: "test-only",
    from: "admin@mkdir.space",
  };
  assert.equal(mailConfigSchema.safeParse(config).success, true);
  for (const patch of [
    { port: 25 },
    { password: "" },
    { host: "https://invalid.test" },
    { from: "x\r\nBcc:someone@example.invalid" },
  ])
    assert.equal(
      mailConfigSchema.safeParse({ ...config, ...patch }).success,
      false,
    );
});
test("part-time contribution floors are employer costs, not employee deductions", () => {
  const p = calculatePayroll({ ...base, hours: 4, basic: 2200 });
  assert.equal(p.relief, 0);
  assert.equal(p.contributionFloor, 4125);
  assert.equal(p.cas, 550);
  assert.equal(p.cass, 220);
  assert.equal(p.incomeTax, 56);
  assert.equal(p.net, 1374);
  assert.equal(p.employerCas, 481);
  assert.equal(p.employerCass, 193);
  assert.equal(p.employerCost, 2924);
  const exempt = calculatePayroll({
    ...base,
    hours: 4,
    basic: 2200,
    floorException: "student",
    evidence: "Certificate-2026-09",
  });
  assert.equal(exempt.net, p.net);
  assert.equal(exempt.employerCas, 0);
  assert.equal(exempt.employerCass, 0);
  assert.equal(exempt.employerCost, 2250);
  const jan = calculatePayroll({
    ...base,
    month: "2026-01",
    hours: 4,
    basic: 2025,
  });
  assert.equal(jan.contributionFloor, 3750);
  assert.equal(jan.employerCas, 432);
  assert.equal(jan.employerCass, 172);
  assert.throws(() => calculatePayroll({ ...base, hours: 4, basic: 2162 }));
  assert.doesNotThrow(() =>
    calculatePayroll({ ...base, hours: 4, basic: 2163 }),
  );
});
test("meal vouchers are non-cash CASS/tax income, excluded from CAS/CAM and relief caps", () => {
  const p = calculatePayroll({
    ...base,
    meals: 800,
    mealsReference: "Issued-09",
  });
  assert.equal(p.gross, 10800);
  assert.equal(p.cashGross, 10000);
  assert.equal(p.contributionBase, 10000);
  assert.equal(p.healthBase, 10800);
  assert.equal(p.cas, 2500);
  assert.equal(p.cass, 1080);
  assert.equal(p.incomeTax, 722);
  assert.equal(p.net, 5698);
  assert.equal(p.cam, 225);
  assert.equal(p.employerCost, 11025);
  const minimum = calculatePayroll({
    ...base,
    basic: 4325,
    meals: 800,
    mealsReference: "Issued-09",
  });
  assert.equal(minimum.relief, 200);
  assert.equal(minimum.personalDeduction, 519);
  assert.equal(minimum.net, 2513);
  const part = calculatePayroll({
    ...base,
    basic: 2200,
    hours: 4,
    meals: 800,
    mealsReference: "Issued-09",
  });
  assert.equal(part.employerCas, 481);
  assert.equal(part.employerCass, 113);
  assert.equal(part.net, 1222);
});
test("an already-paid advance changes remaining cash only and cannot exceed net salary", () => {
  const plain = calculatePayroll(base),
    p = calculatePayroll({
      ...base,
      advance: 500,
      advanceReference: "Bank-09",
    });
  assert.equal(p.net, 5850);
  assert.equal(p.payable, 5350);
  assert.equal(p.incomeTax, plain.incomeTax);
  assert.equal(p.employerCost, plain.employerCost);
  assert.equal(
    calculatePayroll({ ...base, advance: 5850, advanceReference: "Bank-09" })
      .payable,
    0,
  );
  assert.throws(() =>
    calculatePayroll({ ...base, advance: 5851, advanceReference: "Bank-09" }),
  );
  for (const patch of [
    { hours: 0 },
    { hours: 9 },
    { floorException: "student" },
    { hours: 4, floorException: "student", evidence: "" },
    { meals: 800 },
    { primary: "no", meals: 800, mealsReference: "Issued-09" },
    { advance: 100 },
    { hours: 1, basic: 600, meals: 100000, mealsReference: "Issued-09" },
  ])
    assert.throws(() => calculatePayroll({ ...base, ...patch }));
});
