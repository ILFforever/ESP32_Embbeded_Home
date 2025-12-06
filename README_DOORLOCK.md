# ESP32 Smart Door Lock System

## Overview

This project implements a smart door lock system using ESP32 with remote control capabilities via MQTT and backend server integration. The system features a servo motor for physical lock control and buzzer for audio feedback.

## Features

- **Remote Lock/Unlock Control**: Control the door lock via MQTT commands
- **Manual Unlock Button**: Physical button for emergency/manual unlock with server notification
- **Backend Integration**: Fetches commands from a REST API backend server
- **Audio Feedback**: Buzzer provides different tones for locked/unlocked/error states
- **Status Reporting**: Publishes lock status to MQTT broker
- **WiFi Connectivity**: Connects to local WiFi network
- **Auto-Reconnect**: Automatically reconnects to WiFi and MQTT if connection is lost
- **Periodic Heartbeat**: Sends status updates every 30 seconds

## Hardware Requirements

### Components

- **ESP32-DevKitC** or **ESP32-S3-DevKitC**
- **SG90 Servo Motor** (or similar 180° servo)
- **Passive Buzzer** (for audio feedback)
- **Status LED** (optional, uses onboard LED by default)
- **5V Power Supply** (capable of powering ESP32 + servo)
- **Jumper Wires**
- **Breadboard** (for prototyping)

### Wiring Diagram

```
ESP32          Component
-----          ---------
GPIO 18   -->  Servo Signal (Orange/Yellow wire)
5V        -->  Servo VCC (Red wire)
GND       -->  Servo GND (Brown/Black wire)

GPIO 19   -->  Buzzer Positive (+)
GND       -->  Buzzer Negative (-)

GPIO 2    -->  Status LED (or use onboard LED)

GPIO 34   -->  Unlock Button (one side)
GND       -->  Unlock Button (other side)
              (Uses internal pull-up resistor)
```

**Important Notes:**
- Ensure the servo is powered from a stable 5V source
- For high-torque servos, use an external power supply with common ground
- Add a 100µF capacitor across servo power lines to reduce noise

## Software Configuration

### 1. Device Identification

Edit [src/main_doorlock.cpp](src/main_doorlock.cpp):

```cpp
#define DEVICE_ID "dl_001"           // Unique device ID
#define DEVICE_TYPE "doorlock"       // Device type
#define LOCATION_NAME "Front Door"   // Human-readable location
```

### 2. WiFi Configuration

```cpp
const char* WIFI_SSID = "Your_WiFi_SSID";
const char* WIFI_PASSWORD = "Your_WiFi_Password";
```

### 3. Backend Server Configuration

```cpp
const char* BACKEND_URL = "http://your-backend-server.com/api/commands";
const char* DEVICE_API_TOKEN = "your_secure_api_token_here";
```

### 4. MQTT Configuration

Edit [src/doorlock_mqtt.cpp](src/doorlock_mqtt.cpp) if needed:

```cpp
const char* MQTT_SERVER = "broker.hivemq.com";  // Change to your broker
const int MQTT_PORT = 1883;
```

### 5. Servo Calibration

Adjust servo positions in [src/main_doorlock.cpp](src/main_doorlock.cpp):

```cpp
#define SERVO_LOCKED_POS    0    // Locked position (0°)
#define SERVO_UNLOCKED_POS  90   // Unlocked position (90°)
```

Test and adjust these values to match your physical lock mechanism.

## Building and Uploading

### Using PlatformIO

1. **Install PlatformIO** in VS Code or use PlatformIO CLI

2. **Build the project:**
   ```bash
   pio run -e esp32-doorlock
   ```

3. **Upload to ESP32:**
   ```bash
   pio run -e esp32-doorlock --target upload
   ```

4. **Monitor serial output:**
   ```bash
   pio device monitor -e esp32-doorlock
   ```

### Dependencies

The following libraries are automatically installed by PlatformIO:

- **ArduinoJson** (^7.4.2) - JSON parsing and serialization
- **PubSubClient** (^2.8) - MQTT client library
- **ESP32Servo** (^3.0.5) - Servo motor control for ESP32

## MQTT Topics

### Subscribe Topics

- `smarthome/device/{DEVICE_ID}/command` - Receives command notifications

### Publish Topics

- `smarthome/doorlock/status` - Publishes lock status updates

### MQTT Message Format

**Command Notification (Received):**
```json
{
  "fetch_commands": true,
  "device_id": "dl_001",
  "command_id": "cmd_12345",
  "action": "unlock"
}
```

**Status Update (Published):**
```json
{
  "device_id": "dl_001",
  "status": "locked",
  "is_locked": true,
  "timestamp": 12345678
}
```

**Manual Unlock Notification (Sent to Backend):**
```json
POST /api/commands/manual-unlock
{
  "device_id": "dl_001",
  "device_type": "doorlock",
  "location": "Front Door",
  "action": "manual_unlock",
  "timestamp": 12345678,
  "api_token": "your_token_here"
}
```

## Backend API Integration

### Command Fetch Endpoint

**Request:**
```http
POST /api/commands/pending
Content-Type: application/json
Authorization: Bearer {your_token_here}

{
  "device_id": "dl_001"
}
```

**Expected Response:**
```json
{
  "commands": [
    {
      "id": "cmd_12345",
      "action": "unlock",
      "timestamp": "2025-12-06T10:30:00Z"
    }
  ]
}
```

**Note:** This follows the same pattern as the doorbell device - POST request with Bearer token authentication.

### Supported Actions

- `lock` or `LOCK` - Lock the door
- `unlock` or `UNLOCK` - Unlock the door
- `status` or `STATUS` - Report current status

## Audio Feedback

The buzzer provides different tones for different events:

- **Locked**: Two short high-pitched beeps (2000 Hz)
- **Unlocked (Remote)**: One long low-pitched beep (1000 Hz)
- **Unlocked (Manual Button)**: Two long low-pitched beeps (double beep pattern)
- **Error**: Three short low-pitched beeps (500 Hz)

## LED Indicators

- **WiFi Connecting**: Rapid blinking
- **WiFi Connected**: 3 quick blinks
- **Lock Action**: 2 blinks (locked) or 3 blinks (unlocked)
- **Manual Unlock**: 5 blinks (distinguishes manual from remote unlock)

## Operation Flow

1. **Startup**:
   - Initialize pins, servo, WiFi
   - Connect to MQTT broker
   - Set initial state to LOCKED (security default)

2. **Main Loop**:
   - Process MQTT messages
   - Fetch commands from backend every 5 seconds
   - Send heartbeat every 30 seconds
   - Check WiFi connection status

3. **Command Execution**:
   - **Remote**: Receive MQTT notification → Fetch from backend → Execute
   - **Manual**: Button press → Unlock → Notify server → Publish status
   - Provide audio/visual feedback for all actions
   - Publish status update to MQTT

## Troubleshooting

### Servo doesn't move

- Check power supply (servo needs sufficient current)
- Verify wiring connections
- Adjust `SERVO_LOCKED_POS` and `SERVO_UNLOCKED_POS` values
- Test servo separately with example code

### MQTT not connecting

- Verify MQTT broker address and port
- Check WiFi connection
- Ensure firewall allows MQTT port (1883)
- Try public broker first (broker.hivemq.com)

### WiFi connection fails

- Double-check SSID and password
- Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
- Check signal strength
- Increase `WIFI_CONNECT_TIMEOUT` if needed

### Commands not received

- Verify backend API URL is correct
- Check API token authentication
- Monitor serial output for HTTP errors
- Test API endpoint with curl/Postman first

### Button not working

- Check wiring (GPIO 34 to one side, GND to other side)
- Verify button is momentary switch (not latching)
- Check serial monitor for button press messages
- Test with multimeter in continuity mode
- Debounce delay is 500ms (don't press too rapidly)

## Security Considerations

1. **Change default API token** - Never use the example token in production
2. **Use HTTPS** for backend communication when possible
3. **Secure MQTT** with authentication (username/password or certificates)
4. **Network Security** - Use WPA2/WPA3 for WiFi
5. **Physical Security** - Ensure servo mechanism is tamper-resistant
6. **Fail-safe Mode** - Door defaults to LOCKED on startup

## Future Enhancements

- [ ] Add fingerprint sensor integration
- [ ] Implement keypad/PIN entry
- [ ] Battery backup for power outages
- [ ] Door open/close sensor integration
- [ ] Web interface for configuration
- [ ] OTA (Over-The-Air) firmware updates
- [ ] Access log with timestamp recording
- [ ] Multi-user access control
- [ ] Auto-lock timer feature

## File Structure

```
Doorlock/
├── src/
│   ├── main_doorlock.cpp      # Main application code
│   ├── doorlock_mqtt.h        # MQTT header file
│   ├── doorlock_mqtt.cpp      # MQTT implementation
│   └── heartbeat.h            # Heartbeat interface
├── platformio.ini             # PlatformIO configuration
└── README_DOORLOCK.md         # This file
```

## License

This project is open-source. Feel free to modify and adapt for your needs.

## Support

For issues or questions:
1. Check serial monitor output for error messages
2. Verify all configuration settings
3. Test individual components separately
4. Review wiring connections

---

**⚠️ Safety Warning**: This is a prototype system for educational purposes. For production use in critical security applications, implement additional safety measures, redundancy, and professional security audits.
