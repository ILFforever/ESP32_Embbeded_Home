
#include <WiFi.h>
#include <WiFiUdp.h>
#include <ESPmDNS.h>
#include <time.h> // For time functions

// Replace with your network credentials
const char *WIFI_SSID = "ILFforever";
const char *WIFI_PASSWORD = "19283746";
const char *MDNS_HOSTNAME = "HomeHub";

// Variables to save date and time
String formattedDate;
String dayStamp;
String timeStamp;

void wifi_init()
{
    Serial.println("\n=== WiFi Setup ===");
    Serial.printf("Connecting to %s...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true); // Auto-reconnect on WiFi drop
    WiFi.setAutoConnect(true);
    WiFi.setSleep(false); // Disable WiFi sleep for better stability
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int timeout = 20; // 20 second timeout
    while (WiFi.status() != WL_CONNECTED && timeout > 0)
    {
        delay(500);
        Serial.print(".");
        timeout--;
    }

    if (WiFi.status() == WL_CONNECTED)
    {
        Serial.println("\n✅ WiFi Connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());

        // Start mDNS service
        if (MDNS.begin(MDNS_HOSTNAME))
        {
            Serial.printf("✅ mDNS responder started: http://%s.local\n", MDNS_HOSTNAME);
        }
        else
        {
            Serial.println("❌ Error starting mDNS");
        }

        // Configure NTP for Thailand (UTC+7)
        Serial.println("Configuring time for Thailand (UTC+7)...");
        configTime(7 * 3600, 0, "pool.ntp.org");
    }
    else
    {
        Serial.println("\n❌ WiFi Connection Failed!");
        Serial.println("HTTP server will not start");
        return;
    }
}

// WiFi watchdog - call periodically to check connection
void checkWiFiConnection()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("⚠️ WiFi disconnected! Attempting reconnect...");
    WiFi.reconnect();
  }
}