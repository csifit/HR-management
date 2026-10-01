# Monthly payroll approval and revision history

Migration **015**, after 001–014, adds saved payroll runs for selected employees. Migrations **017–018** add normal mid-month starters/leavers with checked dates/day counts and v4 calculations. See [full-month rules](payroll-rules.md), [partial-month rules](payroll-partial-month-rules.md) and [partial-month workflow/release checks](payroll-partial-month.md). These are internal review records, not bank payments, D112 submissions or proof of payment.

Migrations **019–021** extend this same approval/correction workflow with separately reviewed termination settlements, approved annual-leave pay and full-day unpaid leave/absences. Current v7 inputs require HR classification and independent evidence for any formal suspension dates; approval compares leave/attendance sources again. Earlier approved v3–v6 snapshots remain fixed. See [unpaid payroll and current release checks](payroll-unpaid-absences.md) for the current scope and migration order; no unsupported tax treatment is inferred from an attendance label.

## HR workflow

1. Open **Payroll**, choose a 2026 month and create a draft. A run contains only employees explicitly added; it does not automatically cover the whole organisation. The current limit is 200 employees per monthly run.
2. Select an employee, review the supported facts and benefit issuance evidence, calculate the preview and save. Existing entries can be edited or removed while the run is a draft. Source facts and calculated amounts are saved together; the database independently computes results rather than accepting browser totals.
3. Review the included employee list, saved figures and totals. For a **completed month**, confirm the selected scope and approve. The database rechecks every saved source and blocks stale, unsupported or empty runs. A changed source requires reviewing and saving that employee again; if a source is outside the supported calculator scope, handle that employee separately.
4. Generate private payslips from approved entries. Each PDF identifies its month and revision and uses saved company, employee, input and result snapshots. Later profile edits do not rewrite historical figures. Document visibility and email remain explicit actions in Documents.
5. To correct an approved month, create a revision from the **latest approved run** with a reason. This copies its included entries into a new draft. Review/edit/remove/add as required, then approve again. The original approval, figures, PDF links and events remain. The latest approved revision is the current review record; a newer draft does not replace it. Corrections do not reverse or execute payments.
6. An unwanted draft can be discarded with a reason. It remains in history and cannot be edited. Only one open draft is allowed per organisation/month.

Approval is an attestation by a current company owner or HR manager; this release does not require a different person from the preparer. It does not substitute for independent accountant/SAGA validation. Earlier generated PDFs are not imported as approved payroll runs. Older published or emailed PDFs cannot be recalled by a correction; HR must communicate the corrected revision and archive obsolete documents as appropriate.

Manual attendance with reduced/extra hours or a plan that differs from the contractual working day is rejected, including a no-show recorded as zero hours without an absence category. This prevents silently saving full-month salary for a case requiring an unsupported adjustment. The calculator does not prorate gross salary from attendance. Matching full-day manual confirmations and zero-hour non-working days remain accepted.

## Permissions and integrity

Owners and HR managers can read runs, item snapshots, events and PDF links in their organisation. Employee/manager/platform-only access is denied. Suspended organisations retain read access; edits, approval and PDF preparation require active status. Enrolled MFA is enforced. Employees can still access payslips explicitly published to them through the existing Documents permissions.

Checked database functions hold the existing organisation lock and require the expected run version. Employee, contract, time, schedule and benefit writes use the same lock boundary. Approval compares stable source snapshots; midnight changes in derived automatic attendance do not create artificial stale records. Company/employee display data, contract revision, month calendar/schedules, manual attendance and relevant benefits are included. Approved runs have no client mutation path. Private item history retains saved/copied/removed facts; the general audit log contains identifiers and action names, not salaries.

The JavaScript preview and private SQL v3/v4 implementations use matching integer-bani rules. Boundary/parity tests guard drift; this verifies agreement between implementations, not the tax law or independent accountant outputs. A future tax change must introduce explicit versioning and retain historical results, not reinterpret approved entries silently. Existing approved v3 entries remain intact; after 018, refresh/resave earlier drafts to update their source snapshots.

PDF preparation, upload and completion are separate steps. A failed upload may leave a pending document; explicit retry creates another linked document, while the payroll approval stays intact. Existing Storage size/MIME/immutability rules apply. The link identifies the app-generated document's source revision; it is not a digital signature or cryptographic certification of arbitrary content uploaded through an authorised HR API session.

Employee privacy review exports now include that employee's saved payroll records, draft revision history and linked document identifiers. They exclude other employees, whole-run totals, internal actor IDs and full source snapshots. The existing export size limits and review/redaction procedure still apply.

## Release and checks

Migration **016** adds approved-revision accountant handover packages and preparation history. See [accountant handover](accountant-handover.md) for files, access, historical confirmations, limits and manual checks. The package preserves saved calculations; delivery and accountant validation remain separate.

For the original workflow, migration **202609290015_payroll_runs.sql** follows 001–014. For the current starter/leaver frontend, check history and apply **017 then 018 after 001–016** before deployment. No new environment variables are needed. The assistant does not apply production migrations or deploy this release.

Manual checks in RO/EN: create a synthetic closed-month draft, save and edit an employee, confirm totals, test stale tabs/source changes, approve, download its PDF, create/approve a correction and view the original history. Verify current-month approval is unavailable, employee/manager denial and suspended/MFA restrictions. Test Storage upload failure recovery and a privacy ZIP containing only the intended employee's payroll. The user manages the development server and signed-in checks.
