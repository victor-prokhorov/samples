# Functional specification

Each requirement has an id, a priority (MoSCoW for the first release), the users it serves, and acceptance criteria written as Given / When / Then, so each one can become an automated test (23 shows the same criteria as executable specifications). Cross-cutting requirements say `Applies to: all journeys`. `npm run trace` checks that every requirement has at least one criterion and is used by a journey step.

## Members

### REQ-01 Sign in with an organisation account
Priority: Must. Users: members, employer administrators, staff.
- AC1: Given a member with an account at the identity provider, when she signs in, then she lands on her own summary page and the portal never sees her password.
- AC2: Given a signed-in member, when she starts a bank detail change, then she is asked for a second factor if she has not used one in the last 15 minutes.
- AC3: Given a session idle for 30 minutes, when the member clicks a link, then she is asked to sign in again and returns to the same page.

### REQ-02 View my profile
Priority: Must. Users: members.
- AC1: Given a signed-in member, when she opens her profile, then she sees her name, address, employer and membership status, and nothing about any other member.

### REQ-03 View my contribution history
Priority: Must. Users: members.
- AC1: Given a member with contributions in 2025, when she opens the history, then she sees one line per month and the year's total, and the total equals the sum of the lines.
- AC2: Given a member who changed employer during the year, when she opens the history, then each line shows the employer that paid it.

### REQ-04 Request a change of address
Priority: Must. Users: members.
- AC1: Given a signed-in member, when she opens the form, then it is pre-filled with her current address.
- AC2: Given an invalid postcode, when she submits, then the page shows an error summary at the top, linked to the field, and the field keeps what she typed.
- AC3: Given a valid address, when she submits, then a change request is created with status submitted and she sees its reference.

### REQ-05 Request a change of bank details
Priority: Must. Users: members, staff.
- AC1: Given a valid IBAN and a recent second factor, when the member submits, then a change request is created and the old bank details stay in force until it is approved.
- AC2: Given a bank detail change approved by one staff member, when the same staff member tries to give the second approval, then it is refused.
- AC3: Given an effective date in the past, when the member submits, then the request is refused with an explanation.

### REQ-06 Track my requests
Priority: Must. Users: members.

### REQ-07 Download my annual statement
Priority: Must. Users: members.
- AC1: Given a statement generated for 2025, when the member downloads it, then she gets a tagged PDF with a title, the document language set, and the same totals as her contribution history.

### REQ-08 Be told when something changes
Priority: Should. Users: members.
- AC1: The member should get an email when her request is approved.

## Employers

### REQ-09 Upload the monthly contributions file
Priority: Must. Users: employer administrators.
- AC1: Given a file with some invalid rows, when the administrator uploads it, then valid rows are staged, each invalid row is listed with its line number and reason, and nothing is applied until she confirms.
- AC2: Given a file already uploaded, when she uploads the same file again, then it is recognised and not applied twice.

### REQ-10 See only my organisation's members
Priority: Must. Users: employer administrators.
- AC1: Given an administrator for Globex, when she searches members, then she only ever sees members employed by Globex, whatever she types in the URL.

## Staff

### REQ-11 Work the change request queue
Priority: Must. Users: staff.
- AC1: Given submitted requests, when staff open the queue, then requests are ordered oldest first and show the time left before the 3-day service level.
- AC2: Given a request in review, when staff approve or reject it, then a reason is required for a rejection and the member is notified.

### REQ-12 Audit every change
Priority: Must. Users: staff, data protection officer.
- AC1: Given any change to a member's data, when it is applied, then an audit entry records who, when, the request reference, and the values before and after, in the same transaction.

## Cross-cutting

### REQ-13 Accessible to WCAG 2.2 AA and RGAA 4.1
Priority: Must. Applies to: all journeys.
- AC1: Given any member page, when it is checked with axe-core in the pipeline, then there are no violations, and a manual audit each release finds no blocking issue.
- AC2: Given a keyboard-only user, when she completes journey J2, then every control is reachable in a logical order and focus is always visible.

### REQ-14 Available in French and English
Priority: Must. Applies to: all journeys.
- AC1: Given a browser preferring French, when a member opens any page, then it is in French, with `lang="fr"`, French number and date formats, and a link to switch language.

### REQ-15 Reliable and fast enough
Priority: Must. Applies to: all journeys.
- AC1: Given a calendar month, when availability is measured on member requests, then it is at least 99.5% and the p95 page time is under 1 second.

### REQ-16 Personal data protected
Priority: Must. Applies to: all journeys.
- AC1: Given a member who left the scheme more than the retention period ago, when the retention job runs, then her personal data is erased or anonymised and the erasure is logged.
