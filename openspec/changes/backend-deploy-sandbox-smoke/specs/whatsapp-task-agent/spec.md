# Delta Spec — Backend deploy and Kapso Sandbox smoke

## ADDED Requirements

### Requirement: Backend deploy path is documented

The system SHALL provide a documented deploy path for the current Hono/Node backend.

#### Scenario: Developer deploys the backend

- **Given** a developer has the required Kapso and AI environment variables
- **When** they follow the documented deploy steps
- **Then** the Hono/Node app is built and exposed at a public HTTPS URL
- **And** the local development path remains available

#### Scenario: Deploy target needs an adapter

- **Given** the selected deploy target cannot run `@hono/node-server` directly
- **When** deployment support is implemented
- **Then** the repository includes the minimum compatible adapter or config for that target
- **And** the app's Hono routes remain the shared source of truth

### Requirement: Kapso Sandbox webhook setup is documented

The system SHALL document how to connect Kapso Sandbox to the deployed webhook.

#### Scenario: Webhook URL is configured in Kapso

- **Given** the backend is deployed to `https://<deploy-host>`
- **When** configuring Kapso Sandbox
- **Then** the documentation identifies the supported webhook path, including `/api/webhook` if the alias is implemented
- **And** it identifies the required webhook secret/signature environment variable when used

### Requirement: Deploy env vars match current architecture

The system SHALL document environment variables for the current Markdown-backed architecture.

#### Scenario: Env vars are copied to deploy target

- **Given** a developer opens `.env.example` or deploy docs
- **When** they configure the deployed app
- **Then** they see Kapso API credentials, webhook secret, AI provider/model keys, and storage configuration required by the current app
- **And** they are not instructed to configure Supabase or Postgres under current constraints

### Requirement: Kapso Sandbox smoke test is recorded

The system SHALL define a manual smoke test for the public webhook transport path.

#### Scenario: Smoke test succeeds

- **Given** the backend is deployed and Kapso Sandbox points to the public webhook
- **When** a tester sends `hola` from WhatsApp to the Sandbox number
- **Then** the backend receives the inbound message
- **And** the text handler or echo/stub path sends a visible WhatsApp reply or documented console-stub reply
- **And** the smoke evidence is recorded in docs or an artifact

#### Scenario: Smoke test is blocked

- **Given** live Kapso Sandbox validation cannot be performed
- **When** this change is reviewed
- **Then** the blocker is documented explicitly
- **And** automated typecheck/test validation still passes for any repo changes
