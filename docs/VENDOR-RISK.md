# Vendor Risk

This document tracks third-party services, suppliers, and critical dependencies.
It is the place for procurement, security, and exit planning.

## Fields

- vendor name
- service or dependency
- owner
- purpose
- environment
- data shared
- contract or approval status
- security review status
- legal review status
- exit or fallback path

## Rules

- do not add a critical vendor without an owner
- review security and legal posture before production use
- document what data the vendor can see
- define how to leave the vendor if needed
- keep sandbox and production usage separate where possible

## Review Triggers

- new vendor
- major feature from a vendor
- new data sharing path
- pricing or contract change
- incident or outage

## Output

- vendor list
- risk level
- review status
- fallback path

## Rule

If a vendor can affect uptime, data, or cost, it belongs in vendor risk.
