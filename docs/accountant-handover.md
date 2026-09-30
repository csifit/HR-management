# Accountant handover

Migration **016**, after 001–015, adds the accountant package to each approved monthly payroll revision. It introduces no new tax rules and covers only the employees explicitly saved in that revision. SAP remains paused.

## HR workflow

1. Open **Payroll → Monthly payroll → an approved revision**. Review included employees and saved totals. Draft/discarded revisions cannot be exported.
2. Under **Accountant handover / Pachet pentru contabil**, confirm the scope and download the ZIP. The package uses the current RO/EN interface language. An older revision requires an additional explicit acknowledgement; a correction draft is flagged.
3. Open the PDF and CSV files, check the month, revision, included employees and figures, and follow `README.txt`. Use employee IDs and contract numbers when names coincide.
4. Send the reviewed package through the organisation's approved secure delivery method. The application does not automatically send it. The ZIP is not encrypted.

Contents: printable `payroll-summary.pdf`, detailed `payroll.csv`, `remaining-pay.csv`, `totals.csv`, `manifest.json` and `README.txt`. The manifest gives the scope, saved rule version, preparation/approval times and SHA-256/byte counts of the other files. It is an integrity aid, not a digital signature.

CSV uses UTF-8 with BOM, semicolons, no thousands separators, and locale-specific decimals (RO comma, EN point), including fractional contractual hours. All money is RON with two decimals. Import IDs/contracts as text. Text that might become a spreadsheet formula, or lose leading zeros, receives a protective apostrophe. Embedded quotes/separators/newlines are escaped. Yes/no and exception labels are translated.

The PDF contains the summary, cash salary/deduction table and voucher/employer-cost table, with repeated headers and references. Unsupported font characters cause the complete package to fail instead of silently losing text.

## Revisions and scope

Figures, company details and employee/contract labels come from immutable approved snapshots. Later employee, company or contract edits do not change that revision's export. Taxes are never recalculated at download time. Totals sum saved amounts in integer bani.

Historical/latest status and open-correction warnings reflect the preparation moment. New revisions can be approved afterward. Always check the current state before using the amounts. A correction contains the complete figures for its included employees, **not deltas to add to previous revisions**. Compare employee lists as well as amounts; do not combine revisions for the same month.

Remaining pay subtracts already-paid advances once. Meal vouchers do not become cash pay. Employer contribution/cost totals are sums of individual calculations, not final employer filing liabilities. This package is for accountant review; it does not provide a SAGA import, D112 filing or executable bank payment order. Independent accountant validation of the supported payroll cases remains outstanding.

## Access and preparation history

Only the selected organisation's owner/HR can prepare a package. Database checks enforce current membership, MFA when enrolled, active organisation status, approved state, expected version and explicit confirmation under the existing organisation lock. Employees, managers and membership-independent Superadmins have no export access. Suspended HR can inspect existing history but cannot prepare new packages; blocked access remains denied.

History records the preparation attempt, actor, timestamp, language, revision, employee count and historical/correction context. It does not establish successful generation, completed download, recipient delivery or payment. Preparation is recorded before file generation, so failed generation/transfer can still leave a record. A retry creates another preparation record; payroll version and approved facts stay unchanged. No past ZIP is stored for redownload.

The POST endpoint accepts same-origin JSON only, bounds the request body, uses the user's Supabase token and returns private/no-store responses. No service-role key, public Storage link or new environment variable is introduced. Generic audit metadata contains IDs/counts/status only, not financial figures.

Limits: 200 included employees, 2 MiB projected saved JSON, 20 MiB uncompressed files and 4 MiB ZIP. Exceeding a limit rejects the whole package. Data are never silently truncated. No extra employee emails, CNP, bank details or full HR source history are included. Whole-run packages and preparation records are HR operational data; they are not automatically added to individual employee privacy exports.

## Release checks

After checking actual migration history, apply 016 after 001–015 and deploy through the normal process. Remote deployment and signed-in browser checks are separate from local automated tests.

Use synthetic employees for these RO/EN manual checks:

- Download an approved two-employee run with fractional amounts. Open every file and compare employee IDs, figures, total sums, dates and revision to the saved run.
- Import CSV in the accountant's spreadsheet tool using the documented separator/decimal locale. Check diacritics, leading-zero contracts, quoted names and fractional hours.
- Create a correction draft and check the warning; approve it, then export the original revision with the extra historical acknowledgement. A stale tab must refresh before acknowledging historical export.
- Test an expired/MFA-incomplete session, employee/manager account, different organisation and suspended/blocked organisation. Verify no salary package is returned.
- Verify the ZIP response is private/no-store, has the right MIME and fixed filename, and refreshes preparation history. A failed/aborted transfer must never be represented as delivery or payment.
- Inspect long-name/multipage PDF tables and the current/latest status after corrections. Confirm original approved figures remain unchanged.

No production email, payment, migration or deployment is performed by the local implementation tests.
