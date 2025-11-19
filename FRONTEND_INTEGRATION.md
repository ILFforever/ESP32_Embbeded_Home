# Frontend Integration Guide - expireAt Logic

## Overview
The API now uses `expireAt` timestamps instead of an `online` status flag. The frontend must calculate device online status based on the current time vs `expireAt`.

## API Changes

### Before (Old Response):
```json
{
  "success": true,
  "deviceId": "df_001",
  "status": "online",
  "lastSeen": "2025-11-19T08:00:00Z"
}
```

### After (New Response):
```json
{
  "success": true,
  "deviceId": "df_001",
  "lastSeen": "2025-11-19T08:00:00Z",
  "expireAt": "2025-11-19T08:05:00Z"
}
```

## Frontend Implementation

### JavaScript/React Example

```javascript
/**
 * Determine if device is online based on expireAt timestamp
 * @param {string} expireAt - ISO 8601 timestamp
 * @returns {boolean} - true if device is online, false if offline
 */
function isDeviceOnline(expireAt) {
  const now = new Date();
  const expireTime = new Date(expireAt);
  return now < expireTime;
}

/**
 * Get device status with online/offline indicator
 * @param {Object} device - Device object from API
 * @returns {Object} - Device with online status
 */
function getDeviceStatus(device) {
  return {
    ...device,
    online: isDeviceOnline(device.expireAt),
    // Calculate time until offline (in seconds)
    timeUntilOffline: Math.max(0, (new Date(device.expireAt) - new Date()) / 1000)
  };
}

// Usage Example
async function fetchDevices() {
  const response = await fetch('https://embedded-smarthome.fly.dev/api/v1/devices/status', {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN_HERE'
    }
  });

  const data = await response.json();

  // Add online status to each device
  const devicesWithStatus = data.devices.map(device => getDeviceStatus(device));

  return devicesWithStatus;
}

// Update device status periodically
function startDeviceStatusMonitor() {
  setInterval(() => {
    // Re-calculate online status for all displayed devices
    updateDeviceStatuses();
  }, 10000); // Check every 10 seconds
}
```

### Vue.js Example

```vue
<template>
  <div>
    <div v-for="device in devices" :key="device.deviceId" class="device-card">
      <h3>{{ device.deviceId }}</h3>
      <span :class="['status', device.online ? 'online' : 'offline']">
        {{ device.online ? 'Online' : 'Offline' }}
      </span>
      <p>Last Seen: {{ formatDate(device.lastSeen) }}</p>
      <p v-if="device.online">
        Goes offline in: {{ formatTimeRemaining(device.expireAt) }}
      </p>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      devices: [],
      statusInterval: null
    };
  },

  mounted() {
    this.fetchDevices();
    // Update online status every 5 seconds
    this.statusInterval = setInterval(() => {
      this.updateOnlineStatus();
    }, 5000);
  },

  beforeUnmount() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  },

  methods: {
    async fetchDevices() {
      try {
        const response = await fetch('https://embedded-smarthome.fly.dev/api/v1/devices/status', {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          }
        });

        const data = await response.json();
        this.devices = data.devices.map(this.addOnlineStatus);
      } catch (error) {
        console.error('Failed to fetch devices:', error);
      }
    },

    addOnlineStatus(device) {
      return {
        ...device,
        online: this.isDeviceOnline(device.expireAt)
      };
    },

    isDeviceOnline(expireAt) {
      return new Date() < new Date(expireAt);
    },

    updateOnlineStatus() {
      this.devices = this.devices.map(device => ({
        ...device,
        online: this.isDeviceOnline(device.expireAt)
      }));
    },

    formatDate(isoString) {
      return new Date(isoString).toLocaleString();
    },

    formatTimeRemaining(expireAt) {
      const seconds = Math.max(0, (new Date(expireAt) - new Date()) / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${minutes}m ${secs}s`;
    }
  }
};
</script>

<style scoped>
.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
}

.status.online {
  background-color: #4caf50;
  color: white;
}

.status.offline {
  background-color: #f44336;
  color: white;
}

.device-card {
  border: 1px solid #ccc;
  padding: 16px;
  margin: 8px;
  border-radius: 8px;
}
</style>
```

### Angular Example

```typescript
// device.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, timer } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

interface Device {
  deviceId: string;
  lastSeen: string;
  expireAt: string;
}

interface DeviceWithStatus extends Device {
  online: boolean;
  timeUntilOffline: number;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  private apiUrl = 'https://embedded-smarthome.fly.dev/api/v1/devices';
  private authToken = 'YOUR_TOKEN_HERE';

  constructor(private http: HttpClient) {}

  getDevices(): Observable<DeviceWithStatus[]> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.authToken}`
    });

    return this.http.get<{ devices: Device[] }>(`${this.apiUrl}/status`, { headers })
      .pipe(
        map(response => response.devices.map(this.addOnlineStatus.bind(this)))
      );
  }

  // Poll devices and update status every 10 seconds
  getDevicesWithPolling(): Observable<DeviceWithStatus[]> {
    return timer(0, 10000).pipe(
      switchMap(() => this.getDevices())
    );
  }

  private addOnlineStatus(device: Device): DeviceWithStatus {
    const now = new Date();
    const expireTime = new Date(device.expireAt);
    const timeUntilOffline = Math.max(0, (expireTime.getTime() - now.getTime()) / 1000);

    return {
      ...device,
      online: now < expireTime,
      timeUntilOffline
    };
  }

  isDeviceOnline(expireAt: string): boolean {
    return new Date() < new Date(expireAt);
  }
}

// device-list.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { DeviceService } from './device.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-device-list',
  template: `
    <div class="device-list">
      <div *ngFor="let device of devices" class="device-card">
        <h3>{{ device.deviceId }}</h3>
        <span [class]="'status ' + (device.online ? 'online' : 'offline')">
          {{ device.online ? 'Online' : 'Offline' }}
        </span>
        <p>Last Seen: {{ device.lastSeen | date:'short' }}</p>
        <p *ngIf="device.online">
          Goes offline in: {{ formatSeconds(device.timeUntilOffline) }}
        </p>
      </div>
    </div>
  `
})
export class DeviceListComponent implements OnInit, OnDestroy {
  devices: any[] = [];
  private subscription?: Subscription;

  constructor(private deviceService: DeviceService) {}

  ngOnInit() {
    this.subscription = this.deviceService.getDevicesWithPolling()
      .subscribe(devices => {
        this.devices = devices;
      });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  formatSeconds(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
}
```

## Authentication Changes

**IMPORTANT:** The status endpoints now require authentication.

### Add Authorization Header

All requests to `/api/v1/devices/status/*` must include:

```javascript
headers: {
  'Authorization': 'Bearer YOUR_TOKEN_HERE'
}
```

### Example with Fetch

```javascript
const response = await fetch('https://embedded-smarthome.fly.dev/api/v1/devices/status/df_001', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN_HERE',
    'Content-Type': 'application/json'
  }
});
```

### Example with Axios

```javascript
const axios = require('axios');

const response = await axios.get(
  'https://embedded-smarthome.fly.dev/api/v1/devices/status',
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN_HERE'
    }
  }
);
```

## Updating Postman Collection

Update your Postman requests to include the Authorization header:

1. Open the request
2. Go to **Headers** tab
3. Add key: `Authorization`, value: `Bearer YOUR_TOKEN_HERE`
4. Or use Collection-level authorization for all requests

## Error Handling

### 401 Unauthorized Response

```json
{
  "success": false,
  "error": "Authentication required",
  "message": "No authorization header provided"
}
```

Handle this in your frontend:

```javascript
async function fetchDeviceStatus(deviceId) {
  try {
    const response = await fetch(`/api/v1/devices/status/${deviceId}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (response.status === 401) {
      // Redirect to login or refresh token
      handleUnauthorized();
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch device status:', error);
    return null;
  }
}
```

## Best Practices

1. **Refresh Status Regularly**: Update device online status every 5-10 seconds client-side
2. **Cache Tokens**: Store auth tokens securely (localStorage for web, secure storage for mobile)
3. **Handle Expiration**: Gracefully handle devices going from online → offline
4. **Visual Feedback**: Use colors/icons to indicate online/offline status
5. **Time Remaining**: Show countdown until device goes offline (optional but helpful)

## Migration Checklist

- [ ] Replace all `device.status === 'online'` checks with `isDeviceOnline(device.expireAt)`
- [ ] Add Authorization headers to all status API requests
- [ ] Update device status calculation to use expireAt
- [ ] Add periodic status refresh (every 5-10 seconds)
- [ ] Update UI to show online/offline based on expireAt
- [ ] Handle 401 authentication errors
- [ ] Test edge cases (device just expired, device about to expire)
- [ ] Update tests to use expireAt instead of status field
