# Data protection implementation and operational requirements

This is an implementation assessment and launch checklist, not a certification or a substitute for review by the operator's legal adviser/data-protection professional. Updated 23 September 2026.

## Responsibilities and inventory

Confirmed service operator: **Cozumel SRL**, Str. Dr. Louis Pasteur nr 38/ ap. 31, 410154, Oradea, jud. Bihor; privacy contact **admin@mkdir.space**. Its company/tax registration details, named privacy lead/deputy and operational commitments still need completion. The product brand remains separate from this legal identity.

The [provider handbook](privacy/provider-handbook.md), [customer DPA draft](privacy/customer-dpa-draft.md), [vendor register](privacy/subprocessors.md) and [operations-register templates](privacy/operations-register.md) turn the requirements below into working procedures. They are drafts for review/adoption, not signed agreements or evidence that every listed control is operating. Keep completed registers containing personal data outside Git.

For customer HR processing, the employer will ordinarily determine purposes and act as controller, with the service operator processing on documented instructions. The operator may have separate controller responsibilities for account administration/billing. Confirm the actual arrangements in contracts rather than assuming one role for every activity.

The application stores employee contact/employment records, contract salaries, leave categories, attendance, benefits, documents, audit records and delivery metadata. Leave/documents may contain sensitive information: minimize what is collected, avoid diagnoses in free text and limit document visibility. Payroll eligibility is recorded as calculation inputs/counts; children's identifying details are not needed for the current calculator. Supabase holds database/auth/private files; Vercel runs the app; MXroute carries explicitly emailed employee documents. Stripe is proposed, not connected. REGES credentials are not yet collected.

## Implemented technical controls

- Authenticated, tenant-scoped role checks and database RLS; salary/document privacy independent of directory access; no Superadmin HR bypass.
- Optional TOTP MFA. Once enrolled, database helper checks and protected routes reject AAL1 sessions. Test provider enrollment/recovery separately from SQL tests. MFA does not make a stolen, still-valid AAL2 token harmless.
- Private Storage, constrained PDF uploads, authenticated downloads and default HR-only generated payslips. PDFs are parsed, but there is no malware scanning/CDR service; do not describe uploads as virus-free.
- Audited role changes, document changes, lifecycle events and email-attempt outcomes. No secrets or complete SMTP provider errors in ordinary application responses/logs.
- Explicit owner offboarding access removal. Previously downloaded/emailed files cannot be recalled. The app issues no signed URLs; a separately issued bearer link or external copy has its own lifetime.
- TLS SMTP with certificate validation, explicit recipient confirmation and no automatic resend after ambiguous outcomes. Sent attachments are copies outside the private-storage permission boundary. Inbox delivery is not proven by SMTP acceptance.

## Required before a compliance claim

1. Confirm the service operator's legal identity, address and privacy contact. Publish a complete privacy notice and employee-facing employer notices describing purposes, bases, recipients, rights and retention. Do not rely on blanket employee consent for all HR processing.
2. Complete processor agreements, subprocessor disclosures and appropriate transfer mechanisms for Supabase, Vercel, MXroute and future vendors. Verify actual deployment regions, support access and contractual safeguards; no EU-only hosting claim has been verified.
3. Maintain a processing record and a category-specific retention schedule reviewed against employment/accounting obligations. **Archiving currently retains records and files indefinitely.** No automatic purge, tenant erasure, backup erasure or legal-hold workflow is implemented. Add reviewed export/erasure procedures before promising self-service rights fulfilment.
4. Establish authenticated access/rectification/export/erasure requests and response tracking. For manual exports, scope SQL and files to the verified tenant/person, encrypt delivery, record approval and exclude other employees' records. Do not delete statutory records automatically when an account is removed.
5. Define incident triage, containment, evidence preservation and legally required notifications; assign contacts and timekeeping. Maintain backup/restore testing and document recovery objectives. Backups and restore tests have not been verified here.
6. Assess whether a DPIA or DPO is required for the intended processing; record the assessment. Review privileged access periodically. Add malware scanning and audit-retention controls according to assessed risk.

## MFA recovery and email uncertainty

Encourage a second authenticator before a device is replaced. Do not provide a password-only MFA-disable endpoint. If all factors are lost, the operator must verify identity through its documented support procedure before using Supabase's administrative recovery controls, revoke sessions as appropriate and record the action. Do not ask users for TOTP secrets.

An email attempt left pending/uncertain must be checked against MXroute logs before any manual retry. Keep attempt history and record the support decision; do not delete evidence to re-enable the button. SMTP passwords belong only in private environment variables and the deployment secret manager.

References: [GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), [EDPB controller/processor guidance](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en), [EDPB small-business guidance](https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en).
