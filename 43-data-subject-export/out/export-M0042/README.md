# Your personal data: export for member M0042

Request #4, received 2026-10-03T09:00:40Z, answered 2026-10-03T09:00:40Z (due by 2026-11-03).
This export answers your right of access (GDPR article 15) and your right to data portability (article 20).
Controller: the scheme (fictional). Data protection officer: dpo@example.org.

## How to read it

- `data.json` holds everything; each `csv/` file holds one kind of data, one row per record.
- CSV files are UTF-8, comma-separated, with a header row (RFC 4180). Dates are `YYYY-MM-DD`; instants are ISO 8601 in UTC; amounts are in euros.
- "Portable" marks the data you gave us or that your use of the portal produced, which we process under your contract or your consent: article 20 lets you take it to another provider.

## Files

| File | What it holds | Rows | Portable (art. 20) |
| --- | --- | --- | --- |
| `data.json` | Everything below in one machine-readable file. |  |  |
| `csv/members.csv` | Membership record | 1 | yes |
| `csv/contributions.csv` | Contributions | 141 | yes |
| `csv/bank_accounts.csv` | Bank account | 1 | yes |
| `csv/beneficiaries.csv` | Beneficiaries | 2 | yes |
| `csv/consents.csv` | Consents | 2 | no |
| `csv/support_tickets.csv` | Support requests | 3 | yes |
| `csv/credentials.csv` | Sign-in credentials | 1 | no |
| `csv/sessions.csv` | Sign-in sessions | 1 | no |
| `csv/login_events.csv` | Sign-in history | 106 | no |
| `csv/dsar_requests.csv` | Your data requests | 2 | no |
| `csv/dsar_events.csv` | Your data requests: timeline | 4 | no |
| `manifest.json` | SHA-256 checksum of every file, to check nothing was altered. |  |  |

## Membership record (`csv/members.csv`)

- Why we hold it: Run your membership of the scheme: identify you, contact you, compute your rights.
- Lawful basis: Contract (art. 6(1)(b)): your membership of the scheme.
- Where it comes from: You, and your employer when you joined.
- Who receives it: Your employer (membership status and dates only).
- How long we keep it: 10 years after leaving the scheme.

| Column | Meaning | Category |
| --- | --- | --- |
| `member_no` | your member number | identity |
| `given_name` | given name | identity |
| `family_name` | family name | identity |
| `email` | email address | contact details |
| `phone` | phone number | contact details |
| `birth_date` | date of birth | identity |
| `national_id` | social security number | government identifier |
| `address_line` | street address | contact details |
| `postcode` | postcode | contact details |
| `city` | city | contact details |
| `employer_id` | the employer you joined through | employment |
| `joined_on` | date you joined the scheme | employment |
| `left_on` | date you left the scheme, if you have | employment |

## Contributions (`csv/contributions.csv`)

- Why we hold it: Record the contributions paid for you, which your benefits are computed from.
- Lawful basis: Contract (art. 6(1)(b)); kept afterwards under a legal obligation (art. 6(1)(c)) for pension and tax records.
- Where it comes from: Your employer's monthly contribution files.
- Who receives it: Your employer (reconciliation); the tax authority (yearly statement).
- How long we keep it: 10 years after leaving the scheme.

| Column | Meaning | Category |
| --- | --- | --- |
| `period` | month the contribution is for | financial |
| `employer_id` | employer who paid it | employment |
| `amount` | amount in euros | financial |
| `recorded_at` | when we recorded it | financial |

## Bank account (`csv/bank_accounts.csv`)

- Why we hold it: Pay your benefits and refunds.
- Lawful basis: Contract (art. 6(1)(b)).
- Where it comes from: You.
- Who receives it: Our bank, when a payment is made.
- How long we keep it: 1 year after leaving the scheme.

| Column | Meaning | Category |
| --- | --- | --- |
| `iban` | IBAN | financial |
| `holder_name` | account holder's name | financial |
| `updated_at` | when you last changed it | financial |

## Beneficiaries (`csv/beneficiaries.csv`)

- Why we hold it: Pay a death benefit to the people you designated.
- Lawful basis: Contract (art. 6(1)(b)).
- Where it comes from: You.
- Who receives it: None outside the scheme until a benefit is paid.
- How long we keep it: 10 years after leaving the scheme.

| Column | Meaning | Category |
| --- | --- | --- |
| `full_name` | name of the person you designated | third parties |
| `relationship` | their relationship to you | third parties |
| `share_pct` | their share of the benefit, in percent | third parties |

## Consents (`csv/consents.csv`)

- Why we hold it: Prove what you agreed to and when you withdrew it.
- Lawful basis: Legal obligation (art. 6(1)(c) with art. 7(1)): we must be able to show your consent.
- Where it comes from: You, through the portal.
- Who receives it: None.
- How long we keep it: 5 years after consent was withdrawn.

| Column | Meaning | Category |
| --- | --- | --- |
| `purpose` | what the consent is for | consent records |
| `given_at` | when you gave it | consent records |
| `withdrawn_at` | when you withdrew it, if you did | consent records |

## Support requests (`csv/support_tickets.csv`)

- Why we hold it: Answer your questions and requests.
- Lawful basis: Contract (art. 6(1)(b)).
- Where it comes from: You, and our support staff's answers.
- Who receives it: None.
- How long we keep it: 2 years after the ticket was closed.

| Column | Meaning | Category |
| --- | --- | --- |
| `id` | ticket number | communications |
| `opened_at` | when you opened it | communications |
| `closed_at` | when it was closed | communications |
| `subject` | subject | communications |
| `body` | your message | communications |

## Sign-in credentials (`csv/credentials.csv`)

- Why we hold it: Let you sign in securely.
- Lawful basis: Legitimate interests (art. 6(1)(f)): securing your account.
- Where it comes from: You (your password), the portal.
- Who receives it: None.
- How long we keep it: 1 year after leaving the scheme.

| Column | Meaning | Category |
| --- | --- | --- |
| `updated_at` | when you last changed your password | security |

## Sign-in sessions (`csv/sessions.csv`)

- Why we hold it: Keep you signed in, and ask for your password again before sensitive actions.
- Lawful basis: Legitimate interests (art. 6(1)(f)): securing your account.
- Where it comes from: Recorded by the portal when you sign in.
- Who receives it: None.
- How long we keep it: 30 days after the session started.

| Column | Meaning | Category |
| --- | --- | --- |
| `created_at` | when the session started | online identifiers |
| `auth_time` | when you last typed your password in it | online identifiers |
| `user_agent` | your browser, as it described itself | online identifiers |

## Sign-in history (`csv/login_events.csv`)

- Why we hold it: Detect and investigate unauthorised access to your account.
- Lawful basis: Legitimate interests (art. 6(1)(f)): security of the portal.
- Where it comes from: Recorded by the portal when you sign in.
- Who receives it: None.
- How long we keep it: 1 year after the sign-in.

| Column | Meaning | Category |
| --- | --- | --- |
| `at` | when | online identifiers |
| `ip` | the IP address the request came from | online identifiers |
| `user_agent` | your browser, as it described itself | online identifiers |
| `outcome` | success or failure | online identifiers |

## Your data requests (`csv/dsar_requests.csv`)

- Why we hold it: Answer your requests about your data, within the legal deadline, and show that we did.
- Lawful basis: Legal obligation (art. 6(1)(c) with art. 12 and art. 5(2)).
- Where it comes from: Recorded when you make a request.
- Who receives it: None.
- How long we keep it: 3 years after the request was answered.

| Column | Meaning | Category |
| --- | --- | --- |
| `id` | request number | request history |
| `kind` | what you asked for | request history |
| `received_at` | when we received it | request history |
| `due_on` | the date we must answer by | request history |
| `verified_by` | how we checked it was you | request history |
| `status` | where it stands | request history |
| `completed_at` | when we answered | request history |
| `export_sha256` | SHA-256 of the export we gave you | request history |

## Your data requests: timeline (`csv/dsar_events.csv`)

- Why we hold it: Show each step of handling your requests.
- Lawful basis: Legal obligation (art. 6(1)(c) with art. 5(2)).
- Where it comes from: Recorded while your request is handled.
- Who receives it: None.
- How long we keep it: 3 years after the request was answered.

| Column | Meaning | Category |
| --- | --- | --- |
| `request_id` | request number | request history |
| `at` | when | request history |
| `event` | what happened | request history |
| `detail` | details | request history |

## What is not included, and why

- `beneficiaries.birth_date`: Personal data of another person (art. 15(4)): you designated them, so their name and share are shown, but not their date of birth.
- `credentials.password_hash`: A secret derived from your password: giving it out would weaken your account's security, and it says nothing about you.
- `sessions.id_hash`: A hash of a live credential: it is left out for your account's security.
- Legal holds (`legal_holds`): May be restricted while a claim is pending where disclosure would prejudice it (art. 23 and national law); reviewed by the data protection officer case by case.
- Internal keys that only link our tables together are left out.

## Your other rights

You can ask us to correct (art. 16) or erase (art. 17) your data, to restrict its use (art. 18), and you can object to processing based on our legitimate interests (art. 21).
Data we must keep by law (contributions) is kept until its retention period ends, then deleted or anonymised.
You can complain to a supervisory authority (art. 77).
