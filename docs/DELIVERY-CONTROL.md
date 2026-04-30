# Delivery Control

This document turns business requirements into a scope of work, milestone plan, and tracked delivery path.
It applies to new projects, beta work, production work, and change requests.

## Why It Exists

- avoid vague requirements
- prevent scope drift
- make milestones visible
- track budget, time, and token use
- keep change requests from becoming hidden mini-projects

## Requirement Intake

Every request should answer:

- what problem are we solving
- who owns the request
- is this internal, client, or platform work
- what is in scope
- what is out of scope
- what success looks like
- what deadline or constraint exists
- what systems, data, or jurisdictions are involved

## Evaluation Checklist

Before turning a request into a scope of work, check:

- is the requirement clear enough to estimate
- is the requirement tied to a real business outcome
- does it fit an existing product boundary or need a new one
- does it require legal, security, or compliance review
- does it touch new connectors, pipes, or environments
- does it need a separate SOW or can it sit inside an existing one

## Scope of Work

The SOW should include:

- goal and business outcome
- deliverables
- in-scope items
- out-of-scope items
- assumptions
- dependencies
- milestones
- acceptance criteria
- budget
- time estimate
- token estimate
- owner and approvers
- risk notes
- risk register link when risk is meaningful

## Milestone Planning

Use milestones to break the work into manageable checks.

Suggested pattern:

1. discovery
2. design or architecture
3. MVP build
4. QA and review
5. beta or pilot
6. production rollout

Rules:

- each milestone needs a definition of done
- each milestone needs a review gate
- each milestone needs an owner
- each milestone should be small enough to verify

## Budget, Time, and Token Tracking

Track the three budget dimensions together:

- **time**: hours or days spent
- **money**: fixed fee, retainer, or internal cost
- **tokens**: model usage, routing, or agent cost

For each request or milestone, record:

- estimated time
- actual time
- estimated token budget
- actual token usage
- budget status: on track / at risk / exceeded
- reason for variance

Rules:

- set the budget before work starts
- update actuals during execution, not only at the end
- flag overruns early
- if token use spikes, simplify context, compress better, or re-scope
- do not let token spend be invisible just because it is small per call

## Change Requests

Every change request should flow through the same control path:

1. describe the change
2. identify the affected project or milestone
3. estimate impact on scope, budget, time, and tokens
4. decide whether it is included, billable, or a new phase
5. approve or reject
6. update the SOW and milestones if approved
7. record the change in the release or project log

Rules:

- do not treat change requests as casual chat
- no change request is free of impact unless explicitly documented
- if the change alters scope materially, update the SOW
- if the change affects budget or timeline, record the delta

## Evidence

Each project or change should leave behind:

- the requirement summary
- the SOW or change request record
- milestone definitions
- budget/time/token estimates
- actuals
- approvals
- acceptance evidence

## Risk

If the request introduces material risk, link the [Risk Register](RISK-REGISTER.md) and update it alongside the SOW.

## Rule

No project work should start without a clear requirement, a scoped plan, and a way to track budget, time, and token use.
