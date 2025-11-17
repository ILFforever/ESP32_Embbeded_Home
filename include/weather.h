#ifndef WEATHER_H
#define WEATHER_H

#include <Arduino.h>

// Weather data structure
struct WeatherData {
    float temperature;      // Temperature in Celsius
    float humidity;         // Humidity percentage
    String description;     // Weather description (e.g., "Clear", "Rainy")
    String icon;           // Weather icon code
    bool isValid;          // Whether data is valid
    unsigned long lastUpdate; // Timestamp of last update
};

// Initialize weather module
void initWeather();

// Fetch weather data (called by scheduler)
void fetchWeatherTask();

// Get current weather data
WeatherData getWeatherData();

// Check if weather data needs update
bool needsWeatherUpdate();

#endif
