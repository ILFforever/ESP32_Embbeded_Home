# UART Command Reference - Main Amp Module

All commands are JSON formatted and sent via UART (115200 baud).

This module receives commands from the Main LCD hub and responds with status updates.

## Playback Commands

### Play Audio
```json
{"cmd": "play", "url": "doorbell"}
```
- Local file: `"doorbell"` or `"/doorbell.mp3"`
- HTTP stream: `"http://example.com/stream.mp3"`

### Stop Playback
```json
{"cmd": "stop"}
```

## Configuration Commands

### Volume Control
**Set volume (0-21):**
```json
{"cmd": "volume", "level": 15}
```

**Get current volume:**
```json
{"cmd": "volume"}
```

### WiFi Configuration
**Change WiFi credentials (persistent across reboots):**
```json
{"cmd": "wifi", "ssid": "MyNetwork", "password": "MyPassword"}
```

**Get current WiFi info:**
```json
{"cmd": "wifi"}
```

## Information Commands

### System Status
**Get full system status:**
```json
{"cmd": "status"}
```

**Response includes:**
- `playing`: Boolean - is audio playing
- `source`: String - "spiffs" or "stream"
- `url`: String - current audio URL
- `volume`: Number - current volume (0-21)
- `wifi_connected`: Boolean - WiFi connection status
- `wifi_ssid`: String - connected SSID
- `wifi_rssi`: Number - WiFi signal strength (dBm)
- `uptime`: Number - seconds since boot
- `free_heap`: Number - free RAM in bytes
- `spiffs_total`: Number - total SPIFFS space
- `spiffs_used`: Number - used SPIFFS space

### List Files
**List all files in SPIFFS:**
```json
{"cmd": "list"}
```

## System Commands

### Restart Device
**Reboot the ESP32:**
```json
{"cmd": "restart"}
```

### Ping
**Check if device is responsive:**
```json
{"type": "ping", "seq": 1}
```

**Response:**
```json
{"type": "pong", "seq": 1, "timestamp": 12345}
```

## Configuration Persistence

The following settings are saved to flash and persist across reboots:
- **WiFi credentials** - Stored in Preferences, loaded on boot

The following settings are runtime only:
- **Volume** - Resets to default (21) on reboot
- **Playback state** - Always starts in standby

## LED Status Indicators

- **OFF** - Standby/idle
- **BREATHING** - Connecting to WiFi (smooth fade in/out)
- **SOLID ON** - Playing audio
- **OFF** - Stopped/finished playback

## Example Usage

### Change WiFi and Restart
```json
{"cmd": "wifi", "ssid": "NewNetwork", "password": "NewPass123"}
{"cmd": "restart"}
```

### Set Volume and Play
```json
{"cmd": "volume", "level": 18}
{"cmd": "play", "url": "doorbell"}
```

### Check Status
```json
{"cmd": "status"}
```

### Stream from URL
```json
{"cmd": "play", "url": "http://stream.radioparadise.com/mp3-320"}
```

## Notes

- All commands respond with serial debug output
- WiFi credentials are saved immediately and don't require restart
- New credentials take effect on next streaming attempt
- Volume changes are immediate but not saved across reboots
- Maximum volume is 21 (hardware limitation of ESP32-audioI2S library)
