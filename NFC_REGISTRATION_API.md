# NFC Card Registration API (Asynchronous Flow)

This document outlines the asynchronous process for registering an NFC card for a user, involving a frontend, backend, and an ESP32 device.

## Process Overview

1.  **Initiation (Frontend)**: A user or admin initiates the registration process from a web/mobile interface. This tells the backend to get ready for a scan.
2.  **Command (Backend -> Device)**: The backend creates a temporary "registration session" and sends a command to the specified NFC scanner device to start waiting for a card.
3.  **Scan (Device -> Backend)**: The device scans an NFC card and sends the card's ID along with the session ID back to the backend.
4.  **Assignment (Backend)**: The backend verifies the session, finds the user associated with it, and assigns the scanned card to that user.

---

## 1. Initiate NFC Registration

This endpoint is called by the frontend to start the registration process.

**Endpoint (User):** `POST /api/v1/devices/nfc/register/initiate`
**Endpoint (Admin):** `POST /api/v1/devices/nfc/register/initiate/admin/:userId`

-   The admin endpoint allows an admin to register a card for any user specified by `:userId`.
-   The regular user endpoint registers the card for the currently logged-in user.

**Authentication:**
-   User: Requires user authentication token (`protect`).
-   Admin: Requires admin authentication token (`protect` and `authorize('admin')`).

**Headers:**
```
Authorization: Bearer <user_or_admin_token>
```

**Body:**
```json
{
  "deviceId": "doorbell_001"
}
```
-   `deviceId` (required): The ID of the NFC scanner device that will be used for the registration.

#### cURL Example (Admin)
```bash
# Note: Replace <admin_token> and <user_id_to_register_for>
curl -X POST https://embedded-smarthome.fly.dev/api/v1/devices/nfc/register/initiate/admin/<user_id_to_register_for> \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "doorbell_001"
  }'
```

#### Success Response
```json
{
    "success": true,
    "message": "NFC registration initiated. Please scan the card on the device.",
    "sessionId": "aBcDeFgHiJkLmNoPqRsT"
}
```
-   The `sessionId` is returned. While not strictly needed by the frontend for this flow, it can be useful for debugging.

---

## 2. Device Scans and Submits Card

This endpoint is called by the ESP32 device after it has scanned an NFC card.

**Endpoint:** `POST /api/v1/devices/nfc/register/scan`

**Authentication:** Requires device authentication token (`authenticateDevice`).

**Headers:**
```
Authorization: Bearer <device_api_token>
```

**Body:**
```json
{
  "card_id": "0xDA0x790x810x1A",
  "sessionId": "aBcDeFgHiJkLmNoPqRsT"
}
```
-   `card_id` (required): The unique identifier of the NFC card that was scanned.
-   `sessionId` (required): The session ID that the device received in the `start_nfc_registration` command.

#### Success Response
```json
{
    "success": true,
    "message": "NFC card successfully registered."
}
```

#### Error Responses
-   **400 Bad Request:** `card_id` or `sessionId` is missing.
-   **401 Unauthorized:** Invalid or missing device token.
-   **404 Not Found:** The registration session does not exist.
-   **409 Conflict:** The scanned card is already registered to a different user.

---

## 3. Cancel NFC Registration

This endpoint is called by the frontend (typically by an admin) to cancel all active/pending registration sessions on a specific device. This is useful if the registration process was started by mistake or needs to be aborted.

**Endpoint:** `POST /api/v1/devices/nfc/register/cancel/:deviceId`

**Authentication:** Requires admin authentication token (`protect` and `authorize('admin')`).

**Headers:**
```
Authorization: Bearer <admin_token>
```

**URL Parameters:**
- `deviceId` (required): The ID of the NFC scanner device for which to cancel pending sessions.

**Body:** (empty)

#### cURL Example
```bash
curl -X POST https://embedded-smarthome.fly.dev/api/v1/devices/nfc/register/cancel/doorbell_001 \
  -H "Authorization: Bearer <admin_token>"
```

#### Success Response
```json
{
    "success": true,
    "message": "Cancelled 1 pending NFC registration session(s) for device doorbell_001."
}
```

#### Error Responses
- **400 Bad Request:** `deviceId` is missing from the URL.
- **401 Unauthorized:** Invalid or missing admin token.
- **403 Forbidden:** User is not an admin.
- **404 Not Found:** No pending registration sessions were found for the specified device.
