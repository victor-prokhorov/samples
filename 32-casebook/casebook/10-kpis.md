# KPIs

How we will know the rebuild worked. Each KPI has a formula, an owner, a baseline from the old portal (measured in discovery) and a target one year after launch. Sample 29 shows how they are computed from events the app emits.

| KPI | Formula | Baseline (old portal) | Target | Owner |
| --- | --- | --- | --- | --- |
| Adoption | eligible members who signed in during the year / eligible members | to measure (logs) | +15 points | product owner |
| Change request completion | sessions that submitted a valid request / sessions that opened the form | to measure (no event today) | 85% | product owner |
| Change requests online | requests submitted online / all requests (online, email, phone) | about 30% (support tickets) | 80% | product owner |
| Calls to support per 1,000 members per month | support calls / members x 1,000 | to measure (telephony) | -40% | support lead |
| Requests resolved within 3 days | requests decided within 3 days / requests due | to measure (back office) | 90% | support lead |
| First-time-right employer files | files with no rejected row / files uploaded | to measure (rejected files) | 70% | data operations |
| Availability of member requests | requests without a server error / all member requests, monthly | to measure | 99.5% (SLO) | service owner |
| Page time p95 | 95th percentile of server time on member pages | to measure | under 1 s | tech lead |
| Accessibility issues open | blocking or major issues from the last audit not yet fixed | to measure (first audit) | 0 blocking, 0 major | product owner |
| Member satisfaction | share answering 4 or 5 to "how easy was it?" after a task | to measure | 80% | product owner |

Each KPI is reviewed monthly; a missed target names its owner and an action, and a KPI that nobody acts on is removed.
