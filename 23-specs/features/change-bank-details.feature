Feature: Request a change of bank details
  A member's benefit is paid into one bank account. Changing it is the
  most common target of fraud, so staff approve every change, larger
  payments need a second pair of eyes, and nobody approves their own request.

  Background:
    Given today is 2026-03-10
    And member "alice" is paid 800.00 a month into "GB00ACME00000011111111"
    And member "bob" is paid 2400.00 a month into "GB00ACME00000022222222"

  @REQ-01
  Rule: A request stays pending, and the old account stays in use, until it is approved

    Scenario: A new request is pending and changes nothing yet
      When "alice" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      Then the request is "pending"
      And on 2026-04-01 "alice" is paid into "GB00ACME00000011111111"

  @REQ-02
  Rule: Above 1,000.00 a month, a change needs approvals from two different staff members

    Scenario Outline: One approval is enough up to the threshold, not above it
      Given member "carmen" is paid <amount> a month into "GB00ACME00000011111111"
      And "carmen" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      When "carol" approves the request
      Then the request is "<status>"

      Examples:
        | amount  | status                   |
        | 999.99  | approved                 |
        | 1000.00 | approved                 |
        | 1000.01 | awaiting second approval |

    Scenario: A second staff member completes the approval
      Given "bob" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      And "carol" approves the request
      When "dave" approves the request
      Then the request is "approved"

    Scenario: The same staff member cannot give both approvals
      Given "bob" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      And "carol" approves the request
      When "carol" approves the request
      Then the approval is refused with "already approved by carol"
      And the request is "awaiting second approval"

  @REQ-03
  Rule: Nobody can approve a request they made themselves

    Scenario: Staff entering a request on a member's behalf cannot approve it
      Given "carol" requests on behalf of "alice" to be paid into "FR7600000000000000033333333" from 2026-04-01
      When "carol" approves the request
      Then the approval is refused with "cannot approve your own request"
      And the request is "pending"

    Scenario: A member cannot approve their own request
      Given "alice" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      When "alice" approves the request
      Then the approval is refused with "cannot approve your own request"

  @REQ-04
  Rule: The effective date cannot be in the past

    Scenario Outline: Yesterday is refused, today and later are accepted
      When "alice" requests to be paid into "FR7600000000000000033333333" from <date>
      Then the request is <outcome>

      Examples:
        | date       | outcome                                 |
        | 2026-03-09 | refused with "effective date is in the past" |
        | 2026-03-10 | "pending"                               |
        | 2026-03-11 | "pending"                               |

  @REQ-05
  Rule: Once approved, the new account is used from the effective date, and the old one before it

    Scenario: Payments switch accounts on the effective date
      Given "alice" requests to be paid into "FR7600000000000000033333333" from 2026-04-01
      When "carol" approves the request
      Then on 2026-03-31 "alice" is paid into "GB00ACME00000011111111"
      And on 2026-04-01 "alice" is paid into "FR7600000000000000033333333"
