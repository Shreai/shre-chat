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

