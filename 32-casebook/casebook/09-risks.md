# Risk register

Likelihood and impact from 1 (low) to 5 (high); score = likelihood x impact. Reviewed every two weeks with the service owner; a risk scoring 15 or more is raised at the steering meeting.

| Id | Risk | Likelihood | Impact | Score | Mitigation | Owner | Linked to |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Bank details fraud through a taken-over account | 3 | 5 | 15 | MFA step-up, four-eyes, notification to the previous email, 48-hour delay, rule-based call-back | service owner | REQ-01, REQ-05 |
| R2 | Data drifts between old and new systems during migration | 4 | 4 | 16 | One owner per capability, outbox or CDC, daily reconciliation with control totals | tech lead | phases 1-3 |
| R3 | Employers do not adopt the new upload, keep emailing files | 3 | 3 | 9 | Pilot with 3 employers, rejects with reasons, guide per payroll system, support during the first two months | product owner | REQ-09 |
| R4 | The new portal is not accessible enough at launch | 2 | 4 | 8 | Design system, axe in the pipeline, manual checks each release, external audit before launch | product owner | REQ-13 |
| R5 | Identity provider integration slips (MFA, claims for roles) | 3 | 4 | 12 | Spike in discovery, contract tests against the IdP, fallback of email one-time codes for step-up | tech lead | REQ-01 |
| R6 | Team of five also maintains the old portal; rebuild stalls | 4 | 3 | 12 | Freeze features on the old portal, 20% of capacity reserved for it, phases sized to ship every 8-10 weeks | service owner | all phases |
| R7 | Personal data in logs or analytics events | 2 | 4 | 8 | Allow-list of logged fields, review of event schemas, retention on logs | tech lead | REQ-16 |
| R8 | Statement totals differ between old and new calculations | 3 | 5 | 15 | Characterization tests on the old calculation (24), parallel run (04), sign-off by finance before the campaign | tech lead | REQ-07 |
