#include "weather.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// OpenWeatherMap API Configuration
// Sign up for free at: https://openweathermap.org/api
const char* WEATHER_API_KEY = "7f6867d2ea4893ecc7e5765e68a818b4";  // CHANGE THIS!
const char* WEATHER_CITY = "Bangkok";               // CHANGE THIS to your city
const char* WEATHER_COUNTRY = "TH";                 // CHANGE THIS to your country code
const char* WEATHER_UNITS = "metric";               // metric = Celsius, imperial = Fahrenheit

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
    if (String(WEATHER_API_KEY) == "YOUR_API_KEY_HERE") {
        if (Serial) Serial.println("[WEATHER] API key not configured");
        currentWeather.description = "No API Key";
        currentWeather.isValid = false;
        return;
    }

    HTTPClient http;

    // Build URL with parameters
    String url = String(WEATHER_API_URL) +
                 "?q=" + String(WEATHER_CITY) + "," + String(WEATHER_COUNTRY) +
                 "&appid=" + String(WEATHER_API_KEY) +
                 "&units=" + String(WEATHER_UNITS);

    if (Serial) {
        Serial.println("[WEATHER] Fetching weather data...");
        Serial.printf("[WEATHER] Request URL: %s\n", url.c_str());
    }

    http.begin(url);
    http.setTimeout(5000); // 5 second timeout

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();

        // Parse JSON response
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, payload);

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
