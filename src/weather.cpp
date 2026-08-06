#include "weather.h"
#include "app_config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// OpenWeatherMap API Configuration
// Sign up for free at: https://openweathermap.org/api
const char* WEATHER_API_KEY_VALUE = WEATHER_API_KEY;
const char* WEATHER_CITY_VALUE = WEATHER_CITY;
const char* WEATHER_COUNTRY_VALUE = WEATHER_COUNTRY;
const char* WEATHER_UNITS_VALUE = WEATHER_UNITS;

// API endpoint
const char* WEATHER_API_URL = "http://api.openweathermap.org/data/2.5/weather";

// Update interval - 30 minutes = 1,800,000 ms 48 calls/day
#define WEATHER_UPDATE_INTERVAL 1800000  // 30 minutes

// Global weather data
static WeatherData currentWeather = {0, 0, "Loading...", "", false, 0};

void initWeather() {
    currentWeather.temperature = 0;
    currentWeather.humidity = 0;
    currentWeather.description = "Loading...";
    currentWeather.icon = "";
    currentWeather.isValid = false;
    currentWeather.lastUpdate = 0;

    if (Serial) Serial.println("[WEATHER] Weather module initialized");
}

void fetchWeatherTask() {
    // Check if WiFi is connected
    if (WiFi.status() != WL_CONNECTED) {
        if (Serial) Serial.println("[WEATHER] WiFi not connected, skipping update");
        currentWeather.description = "No WiFi";
        currentWeather.isValid = false;
        return;
    }

    // Check if API key is configured
    if (strcmp(WEATHER_API_KEY_VALUE, "YOUR_API_KEY_HERE") == 0) {
        if (Serial) Serial.println("[WEATHER] API key not configured");
        currentWeather.description = "No API Key";
        currentWeather.isValid = false;
        return;
    }

    HTTPClient http;

    // Build URL with parameters (fixed buffer, no heap)
    char url[256];
    snprintf(url, sizeof(url), "%s?q=%s,%s&appid=%s&units=%s",
             WEATHER_API_URL, WEATHER_CITY_VALUE, WEATHER_COUNTRY_VALUE,
             WEATHER_API_KEY_VALUE, WEATHER_UNITS_VALUE);

    if (Serial) {
        Serial.println("[WEATHER] Fetching weather data...");
        Serial.printf("[WEATHER] Request URL: %s\n", url);
    }

    http.begin(url);
    http.setTimeout(5000); // 5 second timeout

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();

        // Parse JSON response with a filter so only the four fields we use are
        // kept - the rest of the ~1KB OpenWeatherMap response is discarded
        StaticJsonDocument<192> filter;
        filter["main"]["temp"] = true;
        filter["main"]["humidity"] = true;
        filter["weather"][0]["main"] = true;
        filter["weather"][0]["icon"] = true;

        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload,
                                                     DeserializationOption::Filter(filter));

        if (!error) {
            // Extract weather data
            currentWeather.temperature = doc["main"]["temp"];
            currentWeather.humidity = doc["main"]["humidity"];
            currentWeather.description = doc["weather"][0]["main"].as<String>();
            currentWeather.icon = doc["weather"][0]["icon"].as<String>();
            currentWeather.isValid = true;
            currentWeather.lastUpdate = millis();

            if (Serial) {
                Serial.println("[WEATHER] Update successful!");
                Serial.printf("[WEATHER] Temperature: %.1f°C\n", currentWeather.temperature);
                Serial.printf("[WEATHER] Humidity: %.0f%%\n", currentWeather.humidity);
                Serial.printf("[WEATHER] Description: %s\n", currentWeather.description.c_str());
            }
        } else {
            if (Serial) Serial.printf("[WEATHER] JSON parse error: %s\n", error.c_str());
            currentWeather.description = "Parse Error";
            currentWeather.isValid = false;
        }
    } else {
        if (Serial) Serial.printf("[WEATHER] HTTP error: %d\n", httpCode);
        currentWeather.description = "API Error";
        currentWeather.isValid = false;
    }

    http.end();
}

WeatherData getWeatherData() {
    return currentWeather;
}

bool needsWeatherUpdate() {
    // Update if never updated or if interval has passed
    return (currentWeather.lastUpdate == 0) ||
           ((millis() - currentWeather.lastUpdate) >= WEATHER_UPDATE_INTERVAL);
}
