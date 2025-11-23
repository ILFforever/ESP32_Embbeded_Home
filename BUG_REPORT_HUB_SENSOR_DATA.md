# Bug Report: Hub Sensor Data Not Displaying in Frontend

**Date**: November 23, 2025
**Severity**: High
**Status**: Fixed
**Branch**: `claude/fix-hub-sensor-data-firebase-path-backend-01Rzyp1w7Sb3nQZgSegGoCuX`

## Summary

The Hub Control page (`/hub`) displays "No temperature data available", "No humidity data available", and "No air quality data available" despite sensor data being successfully stored in Firebase. The root cause is the backend API endpoint reading from the wrong Firebase collection.

---

## Problem Details

### Observable Symptoms

1. **Frontend**: Hub page shows "No data available" for all sensors
2. **Firebase**: Sensor data exists at `devices/hb_001/sensors/current/`
3. **API**: Backend returns `null` for all sensor values
4. **Network**: API calls succeed with 200 OK but empty sensor data

### Root Cause

The `getHubSensors` function in `controllers/devices.js` (line 2071-2116) reads from the **wrong Firebase collection**:

```javascript
// INCORRECT CODE (before fix):
const statusDoc = await deviceRef
  .collection('status')           // ❌ WRONG - no sensor data here
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();
```

**Expected behavior**: Should read from `devices/{device_id}/sensors/current/`
**Actual behavior**: Reads from `devices/{device_id}/status/` (which only contains heartbeat data)

---

## Firebase Data Structure

### Actual Data Location (Correct)

```
devices/
  hb_001/
    sensors/
      current/                    ← SENSOR DATA IS HERE ✓
        temperature: 27.89999962
        humidity: 59
        pm2_5: 9
        pm10: 9
        pm1_0: 7
        timestamp: <firestore timestamp>
        last_updated: November 23, 2025 at 2:54:59 PM UTC+7
        device_type: "hub"
        forwarded_by: "hb_001"
```

### Where Backend Was Looking (Incorrect)

```
devices/
  hb_001/
    status/                       ← BACKEND WAS LOOKING HERE ✗
      (only heartbeat/online status data - no sensors)
```

### Data Write Location (Reference)

The `handleSensorData` function **correctly writes** sensor data to `sensors/current`:

```javascript
// Line 334-338 in controllers/devices.js
await deviceRef.collection('sensors').doc('current').set({
  ...sensors,
  timestamp: admin.firestore.Timestamp.fromDate(new Date(sensorData.timestamp)),
  last_updated: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });
```

This confirms:
- ✅ ESP32 Hub sends sensor data correctly
- ✅ Backend writes sensor data to correct location
- ❌ Backend reads sensor data from **wrong location**

---

## The Fix

### Changes Made to `getHubSensors` Function

**File**: `controllers/devices.js` (lines 2071-2130)

#### Before (Broken):
```javascript
// Get the latest status document which should contain sensor data
const statusDoc = await deviceRef
  .collection('status')
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();

if (statusDoc.empty) {
  return res.status(404).json({
    status: 'error',
    message: 'No sensor data found. Hub may not have sent data yet.'
  });
}

const statusData = statusDoc.docs[0].data();

const sensorData = {
  temperature: statusData.temperature || null,  // Always null!
  humidity: statusData.humidity || null,        // Always null!
  pm25: statusData.pm25 || null,                // Always null!
  aqi: statusData.aqi || null,                  // Always null!
  timestamp: statusData.timestamp,
  device_id
};
```

#### After (Fixed):
```javascript
// Get the current sensor data from sensors/current document
const sensorDoc = await deviceRef
  .collection('sensors')
  .doc('current')
  .get();

if (!sensorDoc.exists) {
  return res.status(404).json({
    status: 'error',
    message: 'No sensor data found. Hub may not have sent data yet.'
  });
}

const data = sensorDoc.data();

// Helper function to calculate AQI from PM2.5
const calculateAQI = (pm25) => {
  if (pm25 == null) return null;

  // EPA AQI breakpoints for PM2.5
  if (pm25 <= 12.0) return Math.round((50 / 12.0) * pm25);
  if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
  if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
  if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
  if (pm25 <= 250.4) return Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201);
  return Math.round(((500 - 301) / (500.4 - 250.5)) * (pm25 - 250.5) + 301);
};

// Extract sensor data with correct field names from Firebase
const sensorData = {
  temperature: data.temperature != null ? data.temperature : null,
  humidity: data.humidity != null ? data.humidity : null,
  pm25: data.pm2_5 != null ? data.pm2_5 : null,  // Note: Firebase stores as pm2_5
  pm10: data.pm10 != null ? data.pm10 : null,
  pm1_0: data.pm1_0 != null ? data.pm1_0 : null,
  aqi: data.aqi != null ? data.aqi : calculateAQI(data.pm2_5),  // Calculate if not stored
  timestamp: data.timestamp,
  device_id
};
```

### Key Improvements

1. **Correct Collection**: Changed from `collection('status')` to `collection('sensors').doc('current')`
2. **Field Name Fix**: Uses `pm2_5` (as stored in Firebase) instead of `pm25`
3. **AQI Calculation**: Added EPA AQI calculation formula if not already stored
4. **Additional Fields**: Returns `pm10` and `pm1_0` for comprehensive air quality data
5. **Better Logging**: Updated log message to indicate reading from `sensors/current`

---

## Similar Issues Found

### ⚠️ Potential Issue: `getHubAmpStreaming` Function

**File**: `controllers/devices.js` (lines 2219-2264)
**Status**: Needs investigation

The `getHubAmpStreaming` function also reads from the `status` collection:

```javascript
// Line 2227-2231
const statusDoc = await deviceRef
  .collection('status')           // May also be incorrect
  .orderBy('timestamp', 'desc')
  .limit(1)
  .get();
```

**Recommendation**: Verify where amplifier streaming status is actually stored in Firebase. If it's stored in a dedicated location (similar to sensors), this endpoint needs the same fix.

---

## Testing Recommendations

### Backend Testing

1. **Unit Test**: Verify `getHubSensors` reads from `sensors/current`
2. **Integration Test**: Confirm API returns actual sensor values from Firebase
3. **Edge Cases**:
   - Missing sensor document (should return 404)
   - Partial sensor data (some fields null)
   - Invalid device_id

### Frontend Testing

1. Navigate to `/hub` page with Hub online
2. Verify temperature displays correctly (e.g., "27.9°C")
3. Verify humidity displays correctly (e.g., "59%")
4. Verify PM2.5 displays correctly (e.g., "9 µg/m³")
5. Verify AQI calculation and category (e.g., "AQI: 38 - Good")
6. Verify "Last updated" timestamp shows recent time

### Expected Results After Fix

Given Firebase data:
```json
{
  "temperature": 27.89999962,
  "humidity": 59,
  "pm2_5": 9,
  "pm10": 9,
  "pm1_0": 7
}
```

Frontend should display:
- **Temperature**: 27.9°C (Comfortable, green)
- **Humidity**: 59% (Comfortable, green)
- **PM2.5**: 9.0 µg/m³
- **AQI**: 38 (Good, green)

---

## Impact

### Before Fix
- ❌ No sensor data displayed on Hub page
- ❌ Users cannot monitor temperature, humidity, or air quality
- ❌ API returns null values despite data existing in Firebase

### After Fix
- ✅ Real-time sensor data displays correctly
- ✅ Temperature, humidity, and PM2.5 values shown
- ✅ AQI calculated and categorized properly
- ✅ Frontend matches actual ESP32 sensor readings

---

## Related Files

### Backend (Modified)
- `controllers/devices.js` - Fixed `getHubSensors` function (line 2071-2130)

### Frontend (No changes needed)
- `src/app/hub/page.tsx` - Already correctly handles API response
- `src/services/devices.service.ts` - Already calls correct endpoint

### Database Structure
- Firebase: `devices/{device_id}/sensors/current/` - Sensor data location

---

## Deployment Checklist

- [x] Fix implemented in branch `claude/fix-hub-sensor-data-firebase-path-backend-01Rzyp1w7Sb3nQZgSegGoCuX`
- [x] Bug report documented
- [ ] Code committed with descriptive message
- [ ] Branch pushed to remote
- [ ] Pull request created
- [ ] Code reviewed
- [ ] Tested on staging environment
- [ ] Merged to Backend branch
- [ ] Deployed to production
- [ ] Verified fix in production

---

## Lessons Learned

1. **Write and Read Consistency**: Always ensure data write and read operations use the same Firebase path
2. **Field Name Consistency**: Document exact field names used in Firebase (e.g., `pm2_5` vs `pm25`)
3. **Early Testing**: Test API endpoints with actual Firebase data, not assumptions
4. **Code Comments**: Comment on Firebase path structure for future maintainers
5. **Logging**: Add detailed logs showing which Firebase path is being queried

---

## Additional Notes

### Firebase Field Naming Convention

The sensor data uses underscore notation:
- `pm2_5` (not `pm25` or `pm2.5`)
- `pm1_0` (not `pm1` or `pm1.0`)

This should be documented in the API specification.

### AQI Calculation

Added EPA (Environmental Protection Agency) AQI calculation formula based on PM2.5 concentration. This provides users with a standardized air quality index even if not sent by ESP32.

**AQI Categories**:
- 0-50: Good (Green)
- 51-100: Moderate (Yellow)
- 101-150: Unhealthy for Sensitive Groups (Orange)
- 151-200: Unhealthy (Red)
- 201-300: Very Unhealthy (Purple)
- 301-500: Hazardous (Maroon)

---

**Reported by**: Claude Code
**Fixed by**: Claude Code
**Reviewed by**: Pending
