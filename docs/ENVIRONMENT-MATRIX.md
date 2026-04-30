# Environment Matrix

| Environment | Purpose | Notes |
|-------------|---------|-------|
| Local | Development | Fast iteration, mock-friendly |
| QA | Validation | Tests, preview deploys, stakeholder review |
| Staging | Release rehearsal | Mirrors prod as closely as practical |
| Production | Live traffic | Strict controls and rollback |
| Client-hosted | Customer infra | Adapt to their hosting and database |
| Nirlab-hosted | Internal infra | Default platform control plane |

## Rules

- every product declares its environments
- every environment declares its secrets and access rules
- deployment adapters map the same product to different targets cleanly

