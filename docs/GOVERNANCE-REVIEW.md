# Governance Review

This document defines how platform rules get reviewed, improved, approved, and enforced.
The goal is to keep Shre OS policy alive, testable, and aligned with the actual product surface.

## Review Board

- audit agent: checks for gaps, contradictions, drift, and unsupported claims
- tech stack expert: checks whether the rule matches the actual architecture
- QA agent: checks whether the rule can be tested and enforced
- security / pentest agent: checks for exposure, unsafe defaults, and missing controls
- legal / compliance reviewer: checks terms, privacy, IP, jurisdiction, and regulated-data implications
- human product owner: makes the final tradeoff decision

## Model And Agent Rule

- every model must read the current platform rules before acting on a task
- every agent must follow the platform rules where they apply to the task
- if a task touches a specialized domain, the agent must also follow the relevant domain doc before making changes
- every new project must include the project operating base before build mode starts
- every product headed toward beta or launch must include the growth operating base before growth work starts
- every project or change request must include a delivery control record before work starts
- if rules conflict, follow the higher-priority rule and escalate the gap through governance review
- if an agent cannot load the rules, it must stop and ask for a safe fallback instead of guessing

## Cadence

- weekly: active product and launch-critical policy review
- monthly: full platform rule sweep
- quarterly: deeper policy refresh, gap analysis, and ownership review
- on change: review immediately when architecture, legal posture, or product scope changes

## Review Triggers

- new product launch
- new country or jurisdiction
- new regulated data class
- new connector or pipe
- incident or security finding
- major architecture change
- repeated QA failure or audit drift
- customer request that changes policy scope

## What To Check

- does the rule match actual code and workflow?
- is the rule testable or enforceable?
- does the rule conflict with another rule?
- does the rule need an exception for a tenant, product, or market?
- does the rule mention a control that does not exist yet?
- does the rule describe an outcome without a path to verify it?

## Rule Lifecycle

1. draft
2. reviewed
3. approved
4. enforced
5. monitored
6. revised or retired

## Evidence Required

- linked implementation or control
- test or QA proof
- audit note
- owner
- revision date
- affected products or workspaces

## Decision Rules

- if a rule cannot be tested, either add a test path or weaken the claim
- if a rule conflicts with a higher-priority legal or security requirement, the higher-priority rule wins
- if a rule adds operational overhead, document the reason and the owner
- if a rule is obsolete, retire it instead of letting it linger

## Outputs

- approved rule changes
- gap list
- exceptions list
- follow-up tasks
- updated review notes

## Rule

Anything that changes the platform rules must pass through governance review before it is treated as enforced policy.
