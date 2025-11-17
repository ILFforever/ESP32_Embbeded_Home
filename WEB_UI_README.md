# ESP32 Doorbell Web Control Panel

A standalone web interface for controlling your ESP32 Doorbell LCD system.

## Quick Start

### Option 1: Open Locally (Easiest)
1. Simply double-click `doorbell-control.html`
2. It will open in your default browser
3. Change the API URL if needed (defaults to `http://doorbell.local`)
4. Start controlling your doorbell!

### Option 2: Host on GitHub Pages (Recommended for Remote Access)
1. Create a new GitHub repository
2. Upload `doorbell-control.html` to the repository
3. Go to Settings → Pages
4. Enable GitHub Pages from main branch
5. Access from anywhere: `https://yourusername.github.io/doorbell-ui/doorbell-control.html`

### Option 3: Host Locally with Python
```bash
# Navigate to the directory
cd c:\Users\paeki\OneDrive\Desktop\Embedded_Project\Doorbell_lcd

# Start simple HTTP server
python -m http.server 8000

# Access at: http://localhost:8000/doorbell-control.html
```

### Option 4: Host on Vercel/Netlify
1. Create account on Vercel or Netlify
2. Drag & drop `doorbell-control.html`
3. Get instant URL like `https://doorbell-ui.vercel.app`

## Features

### 📷 Camera Control
- Start/Stop camera
- Send ping to slave
- Get system status

### 👤 Face Recognition
- Enroll new faces
- Recognize faces
- Delete faces
- Reset database
- Resume detection

### 📋 Face Database Management
- Get face count
- List all faces
- Check database status
- Set/Get face names by ID

### 🔊 Audio Amp Control
- Play internet radio streams
- Play local SPIFFS files (doorbell, success sounds)
- Quick presets for Radio Paradise
- Stop playback
- Restart amp board

### ⚙️ System Control
- Microphone control (start/stop/status)
- Restart LCD ESP32
- Custom UART commands

### 📊 Live Status
- Connection status
- Slave status monitoring
- Amp status monitoring
- System uptime
- Auto-refresh every 2 seconds

## Configuration

The API URL is configurable and persists in localStorage:
- Default: `http://doorbell.local` (mDNS)
- Alternative: `http://192.168.1.xxx` (direct IP)
- Automatically saved when changed

## API Architecture

The ESP32 now runs a lightweight JSON API (no HTML hosting):

### Advantages:
✅ **Smaller firmware** - Removed ~10KB of HTML strings
✅ **Faster responses** - JSON only, no HTML generation
✅ **Better UX** - Modern responsive UI with animations
✅ **Easy updates** - Edit HTML without reflashing ESP32
✅ **CORS enabled** - Works from any origin
✅ **Host anywhere** - GitHub Pages, Vercel, local file, etc.

### API Endpoints

All endpoints return JSON with CORS headers:

**Camera Control:**
- `GET /camera/start` - Start camera
- `GET /camera/stop` - Stop camera
- `GET /ping` - Send ping
- `GET /status` - Get status

**Face Management:**
- `GET /face/count` - Get face count
- `GET /face/list` - List faces (serial output)
- `GET /face/check` - Check database
- `POST /command` - Custom commands (JSON body)

**Audio Amp:**
- `GET /amp/play?url=<url>` - Play URL
- `GET /amp/stop` - Stop playback
- `GET /amp/restart` - Restart amp board

**System:**
- `GET /info` - System information
- `GET /system/restart` - Restart LCD ESP32
- `GET /mic/start` - Start microphone
- `GET /mic/stop` - Stop microphone
- `GET /mic/status` - Microphone status

**Custom Commands:**
```javascript
POST /command
{
  "cmd": "enroll_face",
  "params": { /* optional */ }
}
```

## Browser Compatibility

Works on:
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Network Requirements

- ESP32 and your device must be on the same network (for local IP)
- OR use mDNS: `http://doorbell.local` (works on most modern systems)
- OR host the HTML file online and access ESP32 via public IP/port forwarding

## Troubleshooting

**Can't connect to doorbell:**
1. Check ESP32 is powered on
2. Verify both devices on same WiFi
3. Try direct IP instead of doorbell.local
4. Check serial monitor for ESP32's IP address

**mDNS not working:**
- Windows: Install Bonjour Print Services
- Linux: Install avahi-daemon
- macOS: Works by default
- Alternative: Use IP address directly

**CORS errors:**
- Not an issue when opening HTML locally
- ESP32 sends proper CORS headers
- If hosting online, ensure ESP32 is accessible

## Memory Savings

Before (embedded HTML):
- Flash: 72.7% (952,557 bytes)
- Large HTML string in firmware

After (API-only):
- Flash: ~70% (estimated)
- ~10KB saved
- Cleaner, more maintainable code

## Development

To modify the UI:
1. Edit `doorbell-control.html`
2. Refresh browser (no ESP32 reflash needed!)
3. All API calls use `getApiUrl()` function
4. Toast notifications for user feedback
5. Responsive design works on mobile

## Security Note

This is for local network use. For public access:
- Use VPN or SSH tunnel
- Add authentication (modify ESP32 code)
- Use HTTPS (requires ESP32 SSL setup)
- Implement rate limiting

## Credits

Built for Chulalongkorn University 2110356 Embedded System class project.
