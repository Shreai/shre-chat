# Exception Process

Use this process when a project needs to deviate from the default platform rules.
Exceptions should be narrow, time-bound, and visible.

## When To Use

- customer-specific hosting requirements
- jurisdiction-specific legal language
- regulated-data handling differences
- temporary access or tool exceptions
- launch-time operational constraints

## Required Fields

- exception id
- affected product or workspace
- rule being overridden
- reason for the exception
- reviewer names
- start date
- expiry date
- scope
- mitigation
- rollback or revoke plan

## Rules

- exceptions must be approved, not implied
- exceptions expire unless renewed
- exceptions should be as small as possible
- exceptions must not weaken core security or legal requirements without explicit review
- track exceptions in the relevant product docs and governance review notes

## Review

- audit agent checks for drift and overreach
- security reviewer checks for exposure
- product owner approves tradeoffs
- legal or compliance reviewer approves jurisdiction-sensitive exceptions

## Rule

If a request needs an exception, document it before shipping the change.
