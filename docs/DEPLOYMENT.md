# Deployment

## Branches

- `qa` deploys to QA
- `main` and `master` deploy to production

## QA Deploy

The QA workflow builds the app, runs tests, and then deploys through the QA hook URL when available.
If hook credentials are not present, it can fall back to syncing the built `dist/` folder to a QA host over SSH.

Required GitHub secrets:

- `DEPLOY_HOOK_URL_QA` preferred, used to trigger a QA deploy hook
- `QA_DEPLOY_HOST`
- `QA_DEPLOY_USER`
- `QA_DEPLOY_KEY`
- `QA_DEPLOY_PATH`
- `QA_DEPLOY_APP_NAME` optional, used to restart the process with `pm2`

## Production Deploy

Production uses the webhook-based workflow.

Required GitHub secrets:

- `DEPLOY_HOOK_URL`

## Safety Rules

- QA first, production second
- do not skip tests or build
- do not deploy if the QA target secrets are missing
- keep the rollback path documented before production release
