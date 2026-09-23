# Cozumel SRL — HRConnector privacy operations

Draft operational procedures, 23 September 2026. Owner: Cozumel SRL, Str. Dr. Louis Pasteur nr 38/ ap. 31, 410154, Oradea, jud. Bihor. Privacy contact: admin@mkdir.space. Assign a named responsible person and deputy before adopting these procedures. Legal review is needed for the customer agreement and retention choices; these documents are not a compliance certification.

## Responsibilities towards customer organisations

For customer-directed employee/payroll/document processing, the organisation is ordinarily the controller and Cozumel the processor. For Cozumel's own business contacts, billing, fraud prevention and support administration, assess Cozumel's separate controller purposes and legal bases. Product names and white-label branding do not determine the legal roles. Customer data must not be reused for advertising, unrelated analytics or AI training without a separately established lawful basis and role assessment. [EDPB roles guidance](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en).

Each customer needs a binding processing agreement and documented service instructions. Cozumel must provide confidentiality, appropriate security, controlled subcontracting, rights/incident assistance, return/deletion arrangements and evidence for audits. Outsourcing hosting or email does not remove Cozumel's responsibilities. Use [the DPA draft](customer-dpa-draft.md) and complete [the vendor register](subprocessors.md) before claiming these arrangements are in place.

## Customer onboarding procedure

1. Verify the customer legal entity and authorised representative. Obtain its privacy/incident contacts and an alternate contact; use a verified callback for later changes to these contacts.
2. Record the service order, DPA version and acceptance evidence. Agree which modules and data categories are permitted, approved subprocessors, processing locations and any transfer safeguards.
3. Have the employer approve the employee notice, lawful bases, sensitive-data handling and category retention schedule. Do not choose blanket employee consent as a substitute for this assessment.
4. Set up the owner account and least-privilege roles. Demonstrate employee versus HR visibility, offboarding, optional MFA, export/request escalation and how salary calculations are reviewed. Keep operator production access separate from customer roles.
5. Verify actual backup coverage for both PostgreSQL and Storage binaries, restoration evidence, encryption/access settings and support access. Do not promise an RPO, RTO or deletion time that has not been established and tested.
6. Record remaining gaps with owners/dates in [the operations register](operations-register.md). A checked box does not certify compliance.

## Support and production access

Open a ticket with organisation ID, requester, verified authority, scope and purpose. Prefer reproducing with synthetic data. If real-data access is necessary, obtain documented customer instructions, approve a time-limited access path, log who accessed which scope and revoke access after the ticket. Never grant a Superadmin a general HR-data bypass. Do not copy payslips or SMTP secrets into chat, Git or ordinary logs. Train staff and require confidentiality commitments. Privileged infrastructure accounts should use MFA even though customer MFA is currently optional. [EDPB security guidance](https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en).

## Employee rights requests

Log receipt, organisation, request type and a minimal reference. If Cozumel receives a request for employer-controlled records, forward it securely to the verified employer contact promptly; do not independently decide to disclose or erase its HR records. The employer determines the response and instructs assistance. Cozumel responds directly for data for which it is controller.

The controller normally responds within one month. A justified extension of up to two further months must be communicated within the initial month. Track calendar-month deadlines, not an assumed 30 days; obtain advice on applicable deadline adjustments. Verify identity proportionately and do not collect ID copies automatically. Review exports for other people's data, use secure delivery and record completion or the reason for refusal. Current app downloads are not a complete subject-access export. [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).

## Incident procedure

1. Record discovery/awareness times in UTC, affected tenants/services and an incident lead. Contain the incident while preserving access logs and evidence; revoke compromised credentials/sessions as appropriate.
2. Establish whether personal data was lost, altered, unavailable or disclosed. Record what is known and unknown; do not delay the initial customer warning while waiting for a full forensic report.
3. As processor, notify each affected controller **without undue delay** and provide updates: affected data/people, approximate volumes, likely consequences, containment and contact. There is no automatic 72-hour grace period for a processor. Agree a practicable rapid notification target in the DPA without weakening the statutory obligation.
4. The controller assesses authority notification, normally within 72 hours of awareness unless the breach is unlikely to risk individuals, and whether high risk requires notifying affected people. Cozumel assists. For its own controller data, Cozumel makes these decisions itself and records the reasons.
5. Preserve the decision log, follow-up notices, recovery validation and corrective actions. Test this procedure with a tabletop exercise. No real notification is sent by this repository.

Reference: [EDPB breach-notification guidance, processor notification](https://www.edpb.europa.eu/system/files/2022-10/edpb_guidelines_202209_personal_data_breach_notification_targetedupdate_en.pdf), [European Commission obligations](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en).

## Retention, customer exit and restoration

Obtain an authorised instruction to return or erase data; check customer retention duties and documented holds. Prepare an inventory of tenant rows, private files, delivery metadata, support copies and backups. Export through a reviewed tenant-scoped process, verify completeness and recipient access, then carry out separately authorised deletion. The application currently archives indefinitely and has no tenant-wide erasure engine. Do not use account removal or subscription cancellation as proof of erasure.

Define backup expiry and restoration re-deletion rules with vendors. Keep a minimal deletion/hold record and confirm what was deleted, retained by law, or remains in an expiring backup. If restoration reintroduces expired data, replay approved deletion instructions before returning it to use. Do not promise instant removal from every backup or recall of emailed attachments.

## Review cycle

Proposed operating cadence: monthly access/vendor-change review; quarterly restore and rights-request exercise; incident review after each event; annual DPA, retention, risk/DPIA/DPO and transfer assessment. These are proposed internal controls, not universal statutory intervals. Maintain processor processing records; regular HR processing should not be treated as automatically exempt merely because the business is small. Assess DPO/DPIA requirements based on the actual scale, risks and sensitive-data processing.
