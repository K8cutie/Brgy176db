# ChurchOS — Acceptance Criteria (Gherkin)

> Owner: Product / QA
> Last reviewed: 2026-06-24

Executable-style acceptance criteria for core flows. These describe intended behavior
and double as a manual test script. Several are already guarded by automated tests
(noted inline): unit tests in `src/lib/*.test.ts`, and the Electron/SaaS regression
harnesses in `tests/` (`auth-attack.cjs`, `backup-test.cjs`, `saas-agentic-loop.cjs`,
`auth-backup-e2e.cjs`).

## Authentication & session integrity

```gherkin
Feature: Local sign-in (Electron desktop)

  Scenario: Successful sign-in establishes a main-process verified session
    Given a registered local user
    When they sign in with the correct password
    Then the main process records the signed-in identity
    And the renderer session reconciles to that main-process identity

  Scenario: Tampered localStorage cannot fake a session
    Given no user is signed in
    When localStorage is edited to claim a logged-in user
    Then reconcileSession clears the fake renderer session
    And no audit action is attributed to the spoofed identity
    # Guarded by: tests/auth-attack.cjs

  Scenario: Lockout self-heals on restart
    Given an account is locked out by repeated bad passwords
    When the app is relaunched
    Then the in-memory lockout is cleared
    And the sole admin can sign in again
```

## Fee schedule & sacrament fees

```gherkin
Feature: Sacrament fee lookup

  Scenario: Default fee is returned when no custom schedule exists
    Given no custom fee schedule is stored
    When the fee for "Marriage" is requested
    Then the ceremony fee is 5000
    # Guarded by: src/lib/feeSchedule.test.ts

  Scenario Outline: Only authorized roles may edit the fee schedule
    Given the signed-in user has role "<role>"
    When canEditFeeSchedule is evaluated
    Then it returns "<allowed>"

    Examples:
      | role          | allowed |
      | Parish Priest | true    |
      | Bookkeeper    | true    |
      | Volunteer     | false   |
    # Guarded by: src/lib/feeSchedule.test.ts
```

## Financial posting & approval routing

```gherkin
Feature: Expense approval routing by amount

  Scenario Outline: Amount determines the approval level
    Given an expense of <amount> pesos
    When the approval level is computed
    Then the required level is "<level>"

    Examples:
      | amount  | level                     |
      | 99999   | Direct Post               |
      | 100000  | Council Review Required   |
      | 200000  | Council Consent Required  |
      | 500000  | Bishop Approval Required  |
    # Guarded by: src/lib/financeData.test.ts

  Scenario: Posted amounts display with the peso sign and separators
    Given a value of 1234.5
    When it is formatted for display
    Then it renders as "₱1,234.50"
    # Guarded by: src/lib/financeData.test.ts
```

## Input validation

```gherkin
Feature: Input validation guards bad data

  Scenario: Numeric input with trailing characters is rejected
    Given a user types "123abc" into an amount field
    When the value is parsed
    Then parsing returns null (the entry is rejected, not truncated to 123)
    # Guarded by: src/lib/validation.test.ts

  Scenario: A fee override requires a meaningful reason
    Given an override reason of "ok"
    When it is validated
    Then it is rejected for being under 5 characters
    # Guarded by: src/lib/validation.test.ts
```

## SaaS data isolation (RLS)

```gherkin
Feature: Parish data isolation

  Scenario: A user only ever reads their own parish's data
    Given a signed-in user belonging to Parish A
    When the assistant or the app queries collections/journal entries
    Then only Parish A rows are returned (enforced by RLS)
    # Guarded by: tests/saas-agentic-loop.cjs

  Scenario: A client cannot self-provision an elevated role
    Given a client with only the anon key
    When it attempts to INSERT a profile as "Bishop"
    Then the write is rejected by RLS/guard triggers
    # Guarded by: tests/saas-agentic-loop.cjs
```

## Billing webhook

```gherkin
Feature: Xendit billing callbacks

  Scenario: Inert until configured
    Given XENDIT_CALLBACK_TOKEN is not set
    When a callback is received
    Then the function responds 503 and changes nothing

  Scenario: Reject an unsigned callback
    Given XENDIT_CALLBACK_TOKEN is set
    When a callback arrives without a matching x-callback-token
    Then the function responds 401 and changes nothing

  Scenario: A paid invoice activates the subscription
    Given a valid callback with event "invoice.paid" and a known reference id
    When it is processed
    Then the matching subscription status becomes "active"
    And no internal error detail is returned to the caller
```

## Error handling & resilience

```gherkin
Feature: The app degrades gracefully

  Scenario: A render error does not white-screen the app
    Given a page throws during render
    When the ErrorBoundary catches it
    Then a friendly recovery screen is shown
    And the error is reported to monitoring (if a DSN is configured)
    And parish data remains intact for reload

  Scenario: A hung upstream does not pin the assistant open
    Given the Anthropic API does not respond
    When 10 seconds elapse
    Then the outbound call aborts
    And the client receives a generic server_error with a request_id
```
