# Production Rollout

This document defines the final step from QA to production.
Use it when a product is ready to ship for real.

## Preflight

- QA deploy completed successfully
- tests passed
- build passed
- evidence pack complete
- rollback path documented
- legal or compliance review complete when needed
- production deploy target configured

## Rollout Steps

1. confirm the production target
2. confirm the artifact or commit hash
3. confirm the rollback target
4. deploy to production
5. run a smoke test
6. record the evidence pack
7. notify the owner and support contact

## Rules

- do not treat production as optional once merged to the release branch
- do not promote if QA is failing
- do not promote if the deploy target is missing
- keep the production artifact tied to the reviewed release

## Smoke Test

- open the main entry path
- verify auth or public access as expected
- verify the key workflow still works
- verify no obvious console or runtime failure

## Rollback

- revert to the previous known-good commit or artifact
- verify the rollback with the same smoke path

## Rule

Production rollout is the final verification that the release train is real.
