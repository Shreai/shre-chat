# Connector Catalog

## Purpose

Track every external integration with an owner and scope.

## Fields

- connector name
- owner
- environment
- auth method
- secret location
- required scopes
- callback URLs
- retry policy
- fallback behavior

## Rules

- never add a connector without a named owner
- keep test/sandbox credentials separate from production
- document how to revoke access
- pair every connector entry with a manifest row in [Connector Manifest](CONNECTOR-MANIFEST.md)
- link connector docs back to the app README template when the connector belongs to a specific app
