# Security Baseline

This document defines the baseline protections for data, environments, and network exposure.
It covers database separation, backup posture, edge protection, and the common web attack surface.

## Environment Separation

- dev, QA, beta, staging, and production must use separate databases and separate credentials
- production data must not be copied into lower environments unless it is masked or explicitly approved
- lower environments should use limited-scope data and shorter retention where practical
- each environment should have its own access rules, secrets, and deploy target

## Database Protection

- use parameterized queries or safe ORM patterns to prevent SQL injection
- validate input at the API boundary before it reaches the database
- use least-privilege database users per environment
- encrypt backups and protect backup access separately from runtime access
- keep schema migrations versioned and reviewed
- do not expose database credentials to the browser

## Backup Protection

- back up production databases on a schedule that matches the product risk
- verify backups can be restored
- keep backup retention separate from runtime retention
- test restores to a safe target before relying on them
- document who can initiate a restore

## Network And Edge Protection

- put public services behind TLS
- use Cloudflare or an equivalent edge layer for WAF, bot filtering, and DDoS protection where available
- rate limit auth, write, and abuse-prone endpoints
- block or challenge suspicious scraping and crawling behavior where appropriate
- keep internal services off the public internet when possible

## Browser And Script Protection

- set a strong content security policy where practical
- escape or sanitize untrusted HTML before rendering
- avoid inline script patterns when possible
- protect against cross-site scripting, clickjacking, and unsafe script injection
- use CSRF protection where session-based write actions need it

## Listening And Sniffing

- use HTTPS for public traffic
- use private networks or trusted tunnels for internal hops
- do not send secrets over plain HTTP
- rotate certificates and keys on schedule

## Operational Rules

- review the baseline before launch
- pair it with the threat model and environment matrix
- update it when a new attack path or environment appears

## Rule

If a product can be attacked through the browser, network, or database, the baseline must apply before launch.
