# Delta Spec — Backend Kapso outbound list and limits

## ADDED Requirements

### Requirement: Outbound client supports WhatsApp list messages

The system SHALL expose an outbound helper `sendList(to, body, rows)` for WhatsApp interactive list messages through the Kapso SDK/API.

#### Scenario: List helper sends rows through Kapso

- **Given** a caller provides a destination phone, body text, and list rows
- **When** `sendList` is called
- **Then** the backend sends one WhatsApp interactive list message through Kapso
- **And** each row preserves its caller-provided `id`, `title`, and optional `description`

#### Scenario: List rows are truncated to WhatsApp limits

- **Given** a caller provides more than 10 list rows
- **When** `sendList` is called
- **Then** only the first 10 rows are included in the outbound Kapso request
- **And** the extra rows are not sent

### Requirement: Button helper enforces WhatsApp button limit

The system SHALL cap outbound interactive button messages at 3 buttons.

#### Scenario: Buttons are truncated before sending

- **Given** a caller provides more than 3 buttons
- **When** `sendButtons` is called
- **Then** only the first 3 buttons are included in the outbound Kapso request
- **And** each sent button preserves its caller-provided `id` and `title`

### Requirement: Outbound fallback client matches transport surface

The system SHALL keep the console/fallback outbound client compatible with the real Kapso outbound helper surface.

#### Scenario: Missing Kapso credentials still allow local tests

- **Given** the app is running without real Kapso credentials
- **When** domain code calls `sendText`, `sendButtons`, or `sendList`
- **Then** the fallback client accepts the call without throwing because of a missing method
- **And** it records or logs enough information for local smoke testing
