# Weather System Setup Guide

## Overview
The doorbell LCD now displays real-time weather information fetched from OpenWeatherMap API every 10 minutes.

## Setup Instructions

### 1. Get a Free API Key

1. Go to [OpenWeatherMap](https://openweathermap.org/api)
2. Click "Sign Up" and create a free account
3. After login, go to "API keys" section
4. Copy your API key (it may take a few minutes to activate)

### 2. Configure the Weather Module

Open `src/weather.cpp` and update these constants:

```cpp
const char* WEATHER_API_KEY = "YOUR_API_KEY_HERE";  // Paste your API key here
const char* WEATHER_CITY = "Bangkok";               // Your city name
const char* WEATHER_COUNTRY = "TH";                 // Your country code (2 letters)
const char* WEATHER_UNITS = "metric";               // metric = Celsius, imperial = Fahrenheit
```

### 3. Upload and Test

1. Build and upload the code
2. Open Serial Monitor (115200 baud)
3. Look for weather update messages:
   ```
   [WEATHER] Fetching weather data...
   [WEATHER] Update successful!
   [WEATHER] Temperature: 28.5°C
   [WEATHER] Humidity: 65%
   [WEATHER] Description: Clear
   ```

## Features

- **Auto-refresh**: Weather data updates every 30 minutes
- **Immediate fetch**: Gets weather on startup (no 30-minute wait)
- **Error handling**: Shows error messages if WiFi/API fails
- **Daily limit protection**: Stops at 48 calls/day to avoid charges
- **Call counter**: Tracks API usage and resets every 24 hours
- **Low bandwidth**: Only fetches when needed

## Display Format

When camera is OFF (standby mode), the LCD shows:
```
Good morning!        ← Time-based greeting
10:30               ← Current time
25/11/24            ← Current date
Clear 28C           ← Weather description + temperature
```

## Troubleshooting

### "No WiFi" message
- Check WiFi credentials in `src/http_control.cpp`
- Ensure WiFi network is available

### "No API Key" message
- Update `WEATHER_API_KEY` in `src/weather.cpp`
- Make sure you copied the full key

### "API Error" message
- Verify API key is activated (can take 10-15 minutes after signup)
- Check city name and country code are correct
- Test API manually: `http://api.openweathermap.org/data/2.5/weather?q=Bangkok,TH&appid=YOUR_KEY&units=metric`

### "Parse Error" message
- This usually indicates API response format changed
- Check Serial Monitor for raw response

### "Limit Reached" message
- Daily limit of 48 calls reached (safety protection)
- Weather will resume updating after 24-hour reset
- This should never happen under normal operation

## API Rate Limits

**Important:** OpenWeatherMap "Pay as you call" tier limits:
- **1,000 FREE calls per day**
- £0.0012 per call over the daily limit

**Our Implementation:**
- Updates every **30 minutes** (not 10 minutes)
- Maximum **48 calls per day**
- **Built-in safety limit** prevents exceeding 48 calls
- **Daily counter reset** every 24 hours
- **Well under the 1,000 limit** - uses only 4.8% of daily quota!

This conservative approach ensures you'll never be charged.

## Customization

### Change Update Interval

**⚠️ WARNING:** Changing the interval affects API call limits!

In `src/weather.cpp`, modify:
```cpp
#define WEATHER_UPDATE_INTERVAL 1800000  // 30 minutes in milliseconds
```

**You must also update the daily limit in two places:**

1. In `src/weather.cpp`:
```cpp
#define MAX_DAILY_CALLS 48  // Adjust based on your interval
```

2. In `src/main.cpp` (line 140):
```cpp
Task taskUpdateWeather(1800000, TASK_FOREVER, &updateWeather);
```

**Calculation:** `MAX_DAILY_CALLS = 1440 minutes / update_interval_minutes`

Examples:
- **15 minutes**: `900000` ms → 96 calls/day
- **30 minutes**: `1800000` ms → 48 calls/day (RECOMMENDED)
- **60 minutes**: `3600000` ms → 24 calls/day

**Stay under 1,000 calls/day to avoid charges!**

### Change Display Format

In `src/main.cpp` around line 524:
```cpp
String weatherStr = weather.description + " " + String((int)weather.temperature) + "C";
```

Example with humidity:
```cpp
String weatherStr = weather.description + " " +
                   String((int)weather.temperature) + "C " +
                   String((int)weather.humidity) + "%";
```

## Available Weather Data

The `WeatherData` structure includes:
- `temperature` - Temperature in configured units
- `humidity` - Humidity percentage
- `description` - Short description (Clear, Clouds, Rain, etc.)
- `icon` - Weather icon code (currently unused, can be used for graphics)
- `isValid` - Whether data is valid
- `lastUpdate` - Timestamp of last successful update

## Future Enhancements

Potential improvements:
- Display weather icons using sprites
- Add feels-like temperature
- Show wind speed
- Display sunrise/sunset times
- Add weather forecast (requires different API endpoint)
