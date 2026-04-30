# Release Train

## Default Flow

1. feature branch
2. QA branch
3. staging or preview deploy
4. production deploy

## Cadence

- QA runs on every meaningful change
- staging/preview happens before broad rollout
- production only ships after the release gate passes

## Rules

- keep releases versioned
- ship small batches where possible
- do not merge unrelated changes into one release
- every train needs a rollback target

