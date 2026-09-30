# SAP integration assessment

**Status: deferred at the user's request.** Retain this assessment for future reference; no further SAP work is scheduled.

Reviewed 29 September 2026. This is a feasibility proposal, not an implemented connector or a claim of SAP certification. No customer SAP system, licence agreement, configuration or sandbox has been inspected.

## Recommendation

The integration is technically feasible. Start with one pilot organisation using **SAP SuccessFactors Employee Central**, keeping SAP as the authoritative source of agreed employee and employment fields. HRConnector could provide a focused Romanian/English workspace for staff, managers and local HR: personal overview, requests, attendance display, documents and onboarding. Validate whether this improves the pilot customer's actual tasks before building a broad connector. SAP already offers self-service experiences; a simpler local workflow is a product hypothesis, not an established advantage.

Treat this as an optional enterprise integration with separately scoped setup and support. Do not promise that the base €2/employee/month covers SAP licences, middleware, custom mapping, implementation or ongoing integration support. Obtain customer-specific commercial terms before quoting the connector.

## Which SAP product?

| Customer system | Feasible connection | Implication for HRConnector |
| --- | --- | --- |
| SAP SuccessFactors Employee Central | Supported OData entities and, where appropriate, CompoundEmployee replication | Preferred pilot; discover the customer's actual schema, effective dates, permissions and custom fields first. |
| SAP HCM for SAP S/4HANA / older SAP ERP HCM | Customer-approved services and integration middleware for the installed release | A separate adapter and SAP specialist are likely needed; do not assume the SuccessFactors endpoints work here. |
| SAP SuccessFactors Employee Central Payroll or another SAP payroll deployment | Product-specific, authorised result/time-data integration | Keep SAP payroll authoritative for these employees; determine available result/payslip interfaces with the customer's SAP team. This is not the first connector phase. |

SAP's [core HR and payroll catalogue](https://help.sap.com/docs/portfolio-category/CORE_HR_AND_PAYROLL) identifies Employee Central, Employee Central Payroll and Time Tracking as distinct products. Its [integration overview](https://help.sap.com/docs/successfactors-employee-central-integration-to-business-suite) distinguishes SuccessFactors, SAP ERP HCM and S/4HANA deployments. Merely knowing that a company “uses SAP” does not establish which HR integration is possible.

## A useful first release

1. **Preview a limited import.** Read employee identifiers, names, work email, department, manager, job and employment dates for an agreed population. Show additions, differences, conflicts and unsupported assignments before HR accepts them. Do not automatically create accounts, send invitations or infer Romanian contracts from incomplete SAP records.
2. **Maintain controlled synchronisation.** Agree the authoritative system for each field; lock imported fields locally or send change requests instead of letting two systems overwrite each other. Show last successful sync and unresolved errors in plain language. A missing record, timeout or permission loss must never trigger automatic termination/deletion.
3. **Add one request workflow.** For example, submit leave from HRConnector using the customer's configured SAP time-off process, then display the actual SAP decision. Pending transmission, SAP rejection and final approval must remain distinguishable. Do not count a request as approved local attendance before the agreed approval authority has accepted it.
4. **Evaluate payroll/document display separately.** Import approved outputs only through authorised interfaces and permissions. An SAP payroll employee must not also be recalculated or included in a local payroll run by default. File permissions and correction handling need their own tests.

The first two steps are the recommended pilot scope. Leave write-back, payroll results, SAP single sign-on and automatic REGES transmission are later, separately accepted work. A successful SAP sync would not mean a REGES submission succeeded.

## Data and API design

Use a mapping keyed by HRConnector organisation, SAP connection, external person and employment/assignment identifiers. Never match automatically by name or email alone. Handle rehires, multiple assignments, future changes and effective-dated corrections explicitly; the current single employee/current-contract model needs an import staging area and conflict review before broad SAP coverage.

Employee Central exposes employment-related OData entities such as `EmpEmployment`, `EmpJob` and `EmpCompensation`; effective-dated entities require date-aware queries. Exact fields and read/write support must come from the customer's API metadata and configuration, not a hard-coded generic mapping. See SAP's [employment navigation](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/employment-entity-navigation) and [effective dating](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/effective-dating) guides. The proposed adapter must validate those details in the pilot tenant.

Add durable sync jobs, bounded pagination, retry/backoff, duplicate prevention, reconciliation and per-record outcomes. Advance a sync cursor only after successfully processing its page/batch; reconcile deletions and corrections explicitly. Keep raw payload retention minimal and errors free of salary/identity data. Never run a large synchronisation inside a user page request. HRConnector currently has no production integration queue or encrypted per-organisation credential store, so those are prerequisites rather than existing capabilities.

For SuccessFactors, use the OAuth flow supported by the selected APIs and tenant. SAP's [OAuth client registration guide](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/registering-your-oauth2-client-application) describes an administrator-registered client and certificate/public-key configuration. This is not automatically a consumer-style “Connect SAP” login. API permissions and population restrictions must be scoped by the customer; broad HRIS API permissions can expose sensitive records. See [SAP API access permissions](https://help.sap.com/docs/successfactors-employee-central-integration-to-business-suite/replicating-employee-data-from-sap-s-4hana-on-premise-to-employee-central/permissions-required-for-sap-successfactors-api-access).

For an on-premise deployment, use customer-approved middleware/network access. One option is SAP Integration Suite with the customer's Cloud Connector configuration; this needs its own infrastructure and entitlements and is not a tunnel that Vercel can use automatically. SAP documents [Cloud Connector with integration adapters](https://help.sap.com/docs/integration-suite/sap-integration-suite/using-sap-cloud-connector-with-cloud-integration-adapters) and [explicit RFC resource allowlists](https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/ca5868997e48468395cf0ca4882f5783.html). The exact protocol must match the chosen supported service.

## Access and operational requirements

- Keep credentials and private keys encrypted on the server, isolated per organisation, with rotation, revocation and minimal API permissions. Validate configured endpoints to prevent requests to arbitrary/internal URLs. A shared technical API account must never grant employees access beyond their own HRConnector records.
- Preserve current tenant, HR, manager and employee boundaries. Document synchronisation ownership, customer instructions, imported categories, retention, data locations, subprocessors and how corrections/rights requests propagate. Review these changes through the existing provider privacy process before moving production HR data.
- Use a customer sandbox and synthetic staff first. Test revoked permissions, certificate expiry, rate limits, failed/partial imports, duplicate delivery, changed schemas, future dates, leavers, rehires and conflicting updates. Include a reconciliation screen and a safe pause/disconnect procedure.
- Have the customer's SAP administrator/partner confirm licence and API entitlements. Public API documentation does not itself establish contractual access rights. No SAP subscription price or compatibility guarantee is assumed in this proposal.

## Information needed to implement

Identify the pilot customer, exact SAP HR product/release, cloud or on-premise deployment, available modules, sandbox and SAP technical contact. Then agree the employee population, field ownership, first two workflows, approval authority, sync frequency, custom fields, identity/SSO expectations and commercial/support scope. A targeted read-only proof of concept can follow; implementation effort cannot be estimated reliably before this discovery.

**Roadmap decision:** record SAP as a future optional connector. Finish and validate the core HRConnector workflows, then build against one real pilot configuration rather than advertising a universal SAP integration.
