# ADR-0001: Fleet API Migration

**Status:** Accepted
**Date:** 2026-03-27

## Context

Tesla deprecated the Owner API in 2024. All third-party integrations must use Fleet API.

## Decision

Use Fleet API (`fleet-api.prd.eu.vn.cloud.tesla.com`) with OAuth 2.0.

## Consequences

- Requires Tesla Developer registration
- Must host public key at `/.well-known/appspecific/com.tesla.3p.public-key.pem`
- Commands to post-2021 vehicles require EC signatures
- Access tokens expire in 8 hours; refresh tokens are single-use
