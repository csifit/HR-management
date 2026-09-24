# Privacy requests and employee review exports

Migration **014**, after 001–013, adds `/settings/data-protection/requests`. Company owners and HR managers can access the register. Employees, line managers and a platform administrator without an HR membership cannot read it or prepare exports. Suspended organisations can read existing cases; writes/exports require active status. Enrolled MFA is enforced by the database and Storage as well as the app.

## Record and handle a request

1. Open **Settings → Data protection → Privacy requests and data exports**. Search for the existing employee record; former employees are supported while their records remain in the organisation. Applicant, unknown-person and provider-account requests still need the separate restricted operational register.
2. Record type, receipt date/channel, a minimal scope/reference and a responsible current HR member. The form suggests one calendar month, clamping month ends. HR checks the actual deadline and applicable non-working-day rules. The initial deadline is immutable after creation and may be entered up to one month plus seven days after receipt for calendar adjustments; this software boundary is not a legal extension entitlement.
3. Start review. Enter a short identity/representative-authority verification reference only after that check. Do not upload identity documents or store sensitive evidence in case text. Changing/clearing the reference updates verification state and retains the previous event.
4. An extension requires a reason and the date it was actually communicated. The register allows a revised deadline up to two calendar months after the initial deadline. Late notices can be recorded honestly and are flagged. The software sends no notification and does not stop the deadline while identity is checked. Complex legal exceptions need separate assessment.
5. Record the actual secure response or withdrawal evidence, its date and the outcome before closing. Completion requires verified identity. Refusal can be recorded when identity cannot be established, with reasons and response evidence. Closed cases are immutable; create a new case referencing the earlier one for follow-up/corrections. Case closure does not itself rectify, restrict or erase HR data.

The normal one-month response period, justified extensions and protection of other people's rights are described in [GDPR articles 12 and 15](https://eur-lex.europa.eu/eli/reg/2016/679) and the [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en). These controls assist the employer's decision; they do not establish eligibility for every right or certify compliance.

## Prepare and review an export

An **access or portability** case must be **In review**, with identity verified. Choose a calculated-attendance period of up to 366 days and explicitly select ready PDFs. No PDF is selected automatically. HR may select archived PDFs; visibility is not changed. Review documents from the existing Documents page before selection.

The package contains:

- `employee-data.html`: a readable local browser view, with escaped text and a restrictive content security policy. It uses no network resources or scripts.
- `employee-data.json`: structured employee profile, contract history currently stored, leave requests/allowances, manual attendance history, calculated attendance for the selected period, recurring schedules and calendar dates/work flags, benefit enrolments/allocations, lifecycle tasks/notes, document inventory, delivery metadata, invitation status and current membership in this organisation.
- Selected PDF copies under `documents/<document-id>.pdf`; a document inventory records other files, including pending/unselected files. PDFs with a failed or size-mismatched transfer cause the whole package to fail; there is no partial ZIP presented as complete.
- `manifest.json`: request/export/employee identifiers, preparation timestamp, scope/omissions, selected file versions and SHA-256 hashes. `README.txt` gives Romanian/English review and handling instructions.

Limits are 50 selected PDFs and 50 MiB of PDF content per package, 2 MiB of compact structured database output (with a 4 MiB formatted-JSON browser bound), and a 200-document selection screen. Larger cases require assisted processing or smaller PDF selections; records are never silently truncated. Calculated attendance is explicitly bounded to the chosen dates and uses current sources, not an immutable historical payroll/attendance snapshot. Multiple periods can be prepared if needed.

The export is an **HR review copy**, not an automatic employee-facing disclosure. It can contain legitimate HR-only information, free text, delivery recipients and PDF content relating to other people. Review/redact copies, handle pending/unselected documents, and add the controller's required explanatory information. Raw audit history, internal privacy-case notes, Auth-provider/security records, support records and external/vendor copies need separate assessment and collection. The package alone is not a complete Article 15 response, a universal portability entitlement or an erasure operation.

The current user's Supabase session obtains a transactionally checked, explicitly projected employee payload, then retrieves selected immutable Storage objects under HR RLS. The ZIP is assembled in the browser. No public bucket/link, service-role key, persisted server ZIP or automatic email is introduced. A **preparation** event is written before file transfer; failed/cancelled transfers can therefore leave an honest preparation record. This is not proof of successful download or employee receipt. The ZIP itself is not encrypted: protect local copies and use the organisation's approved secure delivery method. Record actual delivery/response separately and remove working copies according to the approved retention procedure.

## Provider and organisation operations

The employer assigns the responsible person, verifies scope/identity, decides lawful disclosure/retention/redaction and communicates the response. Cozumel assists on documented instructions through the agreed support procedure; this feature grants no standing global access or impersonation. Cozumel's own controller requests remain separate. Customer exit/whole-tenant export, automated erasure, holds, backup erasure/restoration, notifications and secure delivery automation remain future work.

Every case change is retained in an HR-only event snapshot with actor/time/version; direct client updates/deletes on the register, events and export log are revoked. The general audit log receives only case IDs, version/status and export counts/IDs, not case text or identity/response references. Assign retention for these records and exported working copies in the operational policy; this release does not purge them automatically. A former HR assignee is shown as such and must be reassigned to a current HR member before another update.

## Verification and rollout

Apply migration 014 once after verifying existing migration history, then deploy the frontend. No new environment variables are needed. `fflate` is used for local ZIP assembly. The local PGlite regression tests cover tenant/role/MFA/status restrictions, direct-write rejection, history, stale updates, dates, identity checks, document selection/version checks, cross-employee joins, export limits, archive integrity, HTML escaping and incomplete transfers.

Manual checks after deployment: HR creates/reviews a case in RO/EN; month-end default deadline; stale edit in another tab; successful zero-PDF and selected-PDF ZIP; missing/archived file handling; readable HTML, JSON and manifest; closing with actual response evidence; employee/manager direct URL denial; suspended/blocked/MFA behaviour. Use synthetic records and an approved local storage location. Do not send a real employee response as part of a screen check.
