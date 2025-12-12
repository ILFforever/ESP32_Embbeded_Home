# ESP32 Embedded Smart Home System

[![Platform](https://img.shields.io/badge/Platform-ESP32-blue.svg)](https://www.espressif.com/en/products/socs/esp32)
[![Framework](https://img.shields.io/badge/Framework-PlatformIO%20%7C%20ESP--IDF-orange.svg)](https://platformio.org/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Firebase-green.svg)](https://nodejs.org/)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%20%7C%20React-lightgrey.svg)](https://nextjs.org/)

A comprehensive IoT smart home ecosystem built with ESP32 microcontrollers, featuring mesh networking, facial recognition, environmental monitoring, and real-time cloud integration. Developed for Chulalongkorn University's 2110356 Embedded Systems course.

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Hardware Components](#hardware-components)
- [Software Stack](#software-stack)
- [Branch Structure](#branch-structure)
- [Project Importance](#project-importance)
- [Getting Started](#getting-started)
- [Branch Workflow](#branch-workflow)
- [System Integration](#system-integration)
- [Contributing](#contributing)

## 🏠 Overview

The ESP32 Embedded Smart Home System is a production-grade IoT solution that demonstrates modern embedded systems development practices. This project integrates multiple ESP32-based devices into a cohesive smart home network, featuring:

- **Mesh Networking**: Self-healing Painless Mesh network for distributed sensors
- **AI-Powered Security**: Real-time facial recognition for access control
- **Environmental Monitoring**: Multi-sensor arrays for air quality, temperature, and humidity
- **Cloud Integration**: Firebase backend with real-time data synchronization
- **Modern Web Dashboard**: Next.js frontend for monitoring and control
- **Multi-Protocol Communication**: UART, SPI, WiFi, MQTT, and Mesh protocols

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SMART HOME ECOSYSTEM                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐      ┌──────────────────────┐
│   Doorbell System    │      │   Main Hub System    │
│                      │      │                      │
│  ┌────────────────┐  │      │  ┌────────────────┐  │
│  │ Camera (S3)    │  │      │  │  Main Mesh Hub │  │
│  │ - Face Recog   │  │      │  │  - PMS5003     │  │
│  │ - ESP-WHO AI   │◄─┼──────┼──┤  - DHT11       │  │
│  └────────┬───────┘  │ SPI  │  └────────┬───────┘  │
│           │          │      │           │          │
│  ┌────────▼───────┐  │      │  ┌────────▼───────┐  │
│  │ Doorbell LCD   │  │      │  │   Main LCD     │  │
│  │ - Display      │  │      │  │   - Gateway    │  │
│  │ - Audio Amp    │  │      │  │   - Display    │  │
│  └────────────────┘  │      │  └────────┬───────┘  │
└──────────────────────┘      └───────────┼──────────┘
                                          │
        ┌─────────────────────────────────┘
        │ WiFi/MQTT
        ▼
┌──────────────────────┐      ┌──────────────────────┐
│   Cloud Backend      │      │    Mesh Network      │
│                      │      │                      │
│  ┌────────────────┐  │      │  ┌────────────────┐  │
│  │  Firebase      │  │      │  │  Room Sensors  │  │
│  │  Firestore DB  │◄─┼──────┼──┤  - Temperature │  │
│  └────────┬───────┘  │      │  │  - Humidity    │  │
│           │          │      │  │  - Gas/CO      │  │
│  ┌────────▼───────┐  │      │  └────────────────┘  │
│  │  Express.js    │  │      │                      │
│  │  REST API      │  │      │  ┌────────────────┐  │
│  └────────┬───────┘  │      │  │  Door Sensors  │  │
│           │          │      │  │  - NFC Lock    │  │
└───────────┼──────────┘      │  │  - Status LED  │  │
            │                 │  └────────────────┘  │
            │ HTTPS           └──────────────────────┘
            ▼                          │
┌──────────────────────┐               │ Painless Mesh
│   Web Dashboard      │               │ ESP-NOW Protocol
│                      │               │
│  ┌────────────────┐  │               └───────────────┐
│  │  Next.js       │  │                               │
│  │  - Real-time   │  │                               │
│  │  - Responsive  │  │         ┌─────────────────────▼──┐
│  │  - Admin Panel │  │         │  Main Mesh Hub         │
│  └────────────────┘  │         │  (Aggregates all data) │
└──────────────────────┘         └────────────────────────┘
```

## ✨ Key Features

### 🔐 Security & Access Control
- **AI-Powered Facial Recognition**: ESP-WHO framework running on ESP32-S3 for real-time face detection
- **NFC Door Lock**: Secure access control with NFC authentication
- **Face Enrollment System**: Web API for managing authorized users
- **Multi-Factor Authentication**: Combined face + NFC verification

### 🌡️ Environmental Monitoring
- **Air Quality Sensing**: PMS5003 particulate matter sensor (PM1.0, PM2.5, PM10)
- **Temperature & Humidity**: DHT11/DHT22 sensors distributed across rooms
- **Gas Detection**: MQ-series sensors for CO, smoke, and hazardous gases
- **Real-time Alerts**: Threshold-based notifications via backend API

### 🔗 Mesh Networking
- **Self-Healing Network**: Painless Mesh protocol for robust communication
- **Auto-Discovery**: Automatic node detection and network formation
- **Scalable Architecture**: Support for 20+ distributed sensor nodes
- **Low-Latency**: Sub-second data propagation across mesh network

### 🎥 Smart Doorbell
- **Two-Way Audio**: ESP32 audio amplifiers for visitor communication
- **Visual Display**: LCD panels for visitor information and system status
- **Camera Integration**: Live video feed with on-device AI processing
- **Power Management**: Lazy WiFi initialization to conserve energy

### 🌐 Cloud & Web Integration
- **Firebase Backend**: Firestore database with real-time synchronization
- **RESTful API**: Express.js server with comprehensive endpoints
- **Next.js Dashboard**: Modern, responsive web interface
- **MQTT Support**: Lightweight messaging for IoT devices
- **WebSocket Updates**: Real-time data streaming to frontend

### 📊 Data Analytics
- **Sensor Data Logging**: Historical data storage in Firestore
- **Threshold Alerts**: Automated notifications for anomalies
- **Device Status Monitoring**: Live health checks for all components
- **Usage Analytics**: Track system performance and patterns

## 🔧 Hardware Components

### Main Hub System
| Component | Model | Purpose |
|-----------|-------|---------|
| Main Mesh Hub | ESP32-S3 DevKit-C-1 | Central mesh coordinator |
| Air Quality Sensor | PMS5003 | Particulate matter detection |
| Temperature/Humidity | DHT11 | Environmental monitoring |
| Main LCD | ESP32 + ILI9341 | Display and WiFi gateway |
| LCD Amplifier | ESP32 + MAX98357A | Audio output |

### Doorbell System
| Component | Model | Purpose |
|-----------|-------|---------|
| Camera Module | XIAO ESP32-S3 Sense | Facial recognition |
| Doorbell LCD | ESP32 + Display | Visitor interface |
| Audio Amplifier | ESP32 + Amplifier | Two-way communication |
| Power Supply | 5V regulated | System power |

### Distributed Sensors
| Component | Model | Purpose |
|-----------|-------|---------|
| Room Sensor Nodes | ESP32 + DHT22 | Temperature/humidity monitoring |
| Door Lock | ESP32 + NFC reader | Access control |
| Gas Sensors | ESP32 + MQ-series | Safety monitoring |

## 💻 Software Stack

### Embedded Firmware
- **Framework**: PlatformIO (Arduino), ESP-IDF
- **Mesh Protocol**: Painless Mesh (ESP-NOW based)
- **AI Framework**: ESP-WHO (facial recognition)
- **Communication**: UART, SPI, I2C, WiFi

### Backend Services
- **Runtime**: Node.js with Express.js
- **Database**: Firebase Firestore
- **Authentication**: JWT tokens
- **Cloud Functions**: Firebase Cloud Functions
- **Hosting**: Fly.io deployment

### Frontend Application
- **Framework**: Next.js 16
- **UI Library**: React with TypeScript
- **Styling**: Modern responsive CSS
- **Real-time**: WebSocket integration
- **Deployment**: Vercel

### Communication Protocols
- **UART**: 115200 baud for inter-device serial communication
- **SPI**: Camera to LCD data transfer
- **WiFi**: 802.11 b/g/n for cloud connectivity
- **MQTT**: Lightweight IoT messaging
- **Painless Mesh**: Self-organizing mesh network
- **HTTPS**: Secure API communication

## 📁 Branch Structure

### ⚠️ Important Workflow Note
**Each branch contains operational code for a different hardware module.**

- Each branch is **independent** and should **NOT** be merged together
- Do **NOT** merge branches together
- Each device is programmed from its respective branch

### Branch Descriptions

| Branch | Description | Technology | Status |
|--------|-------------|------------|--------|
| **3D-Models** | 3D printable enclosures, Fritzing diagrams | SketchUp, Cura | ✅ Complete |
| **Backend** | Cloud API server, Firebase integration | Node.js, Express | ✅ Complete |
| **Frontend** | Web dashboard for monitoring and control | Next.js, React | ✅ Complete |
| **Main_mesh** | Central mesh hub with environmental sensors | PlatformIO | ✅ Complete |
| **Main_lcd** | Main display and WiFi gateway | PlatformIO | ✅ Complete |
| **Main_amp** | Audio amplifier for main hub | PlatformIO | ✅ Complete |
| **Doorbell_Camera** | AI facial recognition camera | ESP-IDF | ✅ Complete |
| **Doorbell_lcd** | Doorbell display interface | PlatformIO | ✅ Complete |
| **Doorbell_Amp** | Doorbell audio system | PlatformIO | ✅ Complete |
| **Door_lock** | NFC-based access control | PlatformIO | ✅ Complete |
| **Room_Sensors** | Distributed environmental sensors | PlatformIO | ✅ Complete |

## 🎯 Project Importance

### Educational Value
This project demonstrates comprehensive embedded systems development, covering:
- **Multi-Device Coordination**: Inter-device communication protocols
- **Real-Time Systems**: Sensor data acquisition and processing
- **Network Protocols**: Mesh networking, WiFi, UART, SPI
- **Cloud Integration**: IoT device to cloud architecture
- **AI on Edge**: On-device machine learning for facial recognition
- **Power Management**: Energy-efficient embedded design

### Industry Relevance
The system showcases production-ready IoT development practices:
- **Scalable Architecture**: Modular design supporting 50+ devices
- **Fault Tolerance**: Self-healing mesh network
- **Security Best Practices**: JWT authentication, encrypted communication
- **Modern DevOps**: CI/CD, containerization, cloud deployment
- **Full-Stack Integration**: Embedded to cloud to web

### Real-World Applications
This architecture can be adapted for:
- Smart Home Automation
- Industrial IoT Monitoring
- Building Management Systems
- Agricultural Sensor Networks
- Healthcare Monitoring Solutions

## 🚀 Getting Started

### Prerequisites
```bash
# Required software
- PlatformIO (for ESP32 firmware)
- Node.js v16+ (for backend)
- Python 3.7+ (for deployment scripts)
- Git

# Hardware requirements
- ESP32 boards (see Hardware Components)
- Sensors and peripherals
- Power supplies (5V regulated)
```

### Quick Start

#### 1. Clone the Repository
```bash
git clone https://github.com/ILFforever/ESP32_Embbeded_Home.git
cd ESP32_Embbeded_Home
```

#### 2. Set Up Backend
```bash
# Switch to Backend branch
git checkout Backend

# Install dependencies
npm install

# Configure Firebase credentials (see Backend README)
# Create .env file with required variables

# Start development server
npm run dev
```

#### 3. Set Up Frontend
```bash
# Switch to Frontend branch
git checkout Frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start development server
npm run dev
```

#### 4. Flash ESP32 Devices
```bash
# Example: Main Mesh Hub
git checkout Main_mesh

# Build and upload
pio run --target upload

# Monitor serial output
pio device monitor
```

### Configuration

#### Mesh Network Settings
All mesh nodes must use matching credentials:
```cpp
#define MESH_PREFIX       "ESP32_SmartHome_Mesh"
#define MESH_PASSWORD     "smarthome2024"
#define MESH_PORT         5555
```

#### WiFi Configuration
Configure in each WiFi-enabled device:
```cpp
const char* WIFI_SSID = "your_ssid";
const char* WIFI_PASSWORD = "your_password";
```

#### Backend API Endpoint
Update in Main LCD firmware:
```cpp
const char* API_ENDPOINT = "https://embedded-smarthome.fly.dev/api/v1";
```

## 📖 Branch Workflow

### Viewing All Branches
```bash
git branch -a
```

### Cloning a Specific Branch
```bash
git clone -b <branch-name> https://github.com/ILFforever/ESP32_Embbeded_Home.git
```

### Switching to a Branch
```bash
git checkout <branch-name>
# or
git switch <branch-name>
```

### Checking Current Branch
```bash
git branch
```

### Development Workflow
1. **Never merge hardware branches** - Each contains distinct firmware
2. **Keep code in respective branches** - Main branch is for documentation only
3. **Test thoroughly** - Hardware integration requires careful validation
4. **Document changes** - Update branch-specific READMEs

## 🔄 System Integration

### Data Flow
```
Sensor Node → Mesh Network → Main Mesh Hub → UART → Main LCD → WiFi → Backend API → Firestore
                                                                         ↓
                                                                    Web Dashboard
```

### Communication Timing
- **Mesh Updates**: Real-time (event-driven)
- **Main Mesh → LCD**: Every 15 seconds (aggregated)
- **LCD → Backend**: Every 30 seconds
- **Frontend Polling**: Every 5 seconds

### Latency Breakdown
- Sensor reading: ~250ms
- Mesh transmission: ~50-200ms
- Data aggregation: ~0-15s (buffering)
- Cloud upload: ~200-500ms
- Frontend update: ~0-5s (polling)
- **Total end-to-end**: ~10-12 seconds average

## 📚 Documentation

Each branch contains detailed documentation:
- **README.md**: Branch-specific setup and usage
- **API documentation**: Available in Backend branch
- **Wiring diagrams**: Available in Main_mesh branch
- **Architecture docs**: System design and protocols
- **Integration guides**: Cross-component communication

## 🤝 Contributing

This is an academic project for Chulalongkorn University's Embedded Systems course.

### Team Members
Developed by the Arduino888 team for 2110356 Embedded Systems (2024).

### Development Guidelines
1. Work only on your assigned branch
2. Test all changes on actual hardware before committing
3. Update documentation when adding features
4. Follow existing code style and conventions
5. Never merge hardware branches

## 📄 License

MIT License - See LICENSE file for details

## 🔗 Resources

- **Backend API**: https://embedded-smarthome.fly.dev
- **Documentation**: Available in each branch
- **ESP-IDF**: https://docs.espressif.com/projects/esp-idf/
- **PlatformIO**: https://platformio.org/
- **Firebase**: https://firebase.google.com/

## 📧 Contact

For questions or issues:
- Create an issue in this repository
- Contact the development team through Chulalongkorn's course platform

---

**Built with ❤️ by Arduino888 Team | Chulalongkorn University 2024**
