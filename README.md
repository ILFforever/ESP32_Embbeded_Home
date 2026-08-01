# ESP32 Embedded Smart Home System

[![Platform](https://img.shields.io/badge/Platform-ESP32-blue.svg)](https://www.espressif.com/en/products/socs/esp32)
[![Framework](https://img.shields.io/badge/Framework-PlatformIO%20%7C%20ESP--IDF-orange.svg)](https://platformio.org/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Firebase-green.svg)](https://nodejs.org/)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%20%7C%20React-lightgrey.svg)](https://nextjs.org/)

A comprehensive IoT smart home ecosystem built with ESP32 microcontrollers, featuring Edge AI facial recognition, NFC scanning, mesh networking, environmental monitoring, and real-time cloud integration. Developed for Chulalongkorn University's 2110356 Embedded Systems course.

## 📋 Table of Contents

- [Overview](#-overview)
- [Test Credentials](#-test-credentials)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Hardware Components](#-hardware-components)
- [Software Stack](#-software-stack)
- [Frontend Application](#-frontend-application)
- [Branch Structure](#-branch-structure)
- [Contributing](#-contributing)

## 🏠 Overview

The ESP32 Embedded Smart Home System is a production-grade IoT solution that demonstrates modern embedded systems development practices. This project integrates multiple ESP32-based devices into a cohesive smart home network, featuring:

- **Mesh Networking**: Self-healing Painless Mesh network for distributed sensors
- **AI-Powered Security**: Real-time on device facial recognition for access control
- **Environmental Monitoring**: Multi-sensor arrays for air quality, temperature, and humidity
- **Cloud Integration**: Firebase backend with real-time data synchronization
- **Modern Web Dashboard**: Next.js frontend for monitoring and control
- **Multi-Protocol Communication**: UART, SPI, WiFi, MQTT, and Mesh protocols

## 🔑 Test Credentials

You can access the system using the test credentials:

| Email | Password | Role |
|-------|----------|------|
| admin@gmail.com | 12345678 | Admin |
| user@gmail.com | 12345678 | User |
## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SMART HOME ECOSYSTEM                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐   ┌─────────────────────┐   ┌──────────────────────────┐
│  DOORBELL SYSTEM     │   │  MAIN HUB SYSTEM    │   │  DOOR LOCK               │
│                      │   │                     │   │                          │
│  ┌────────────────┐  │   │  ┌──────────────┐   │   │  ┌────────────────────┐  │
│  │ ESP32-S3 Cam   │  │   │  │  Mesh Sensors│   │   │  │  ESP32 + Servo     │  │
│  │ - Face Recog   │  │   │  │  (Painless   │   │   │  │  - Door Control    │  │
│  │ - ESP-WHO AI   │  │   │  │   Mesh Net)  │   │   │  │  - Status LED      │  │
│  └───────┬────────┘  │   │  │              │   │   │  └──────────┬─────────┘  │
│          │ SPI       │   │  │ • Room Temp  │   │   │             │            │
│          ▼           │   │  │ • Humidity   │   │   │             │            │
│  ┌────────────────┐  │   │  │ • Gas/CO     │   │   │             │            │
│  │ Doorbell LCD   │  │   │  └──────┬───────┘   │   │             │            │
│  │ - Display      │  │   │         │ Mesh      │   │             │            │
│  │ - NFC Scanner  │  │   │         ▼           │   │             │            │
│  │ - Audio        │  │   │  ┌──────────────┐   │   │             │            │
│  └───────┬────────┘  │   │  │ Main Mesh    │   │   │             │            │
│          │           │   │  │ Hub          │   │   │             │            │
│          │           │   │  │ - PMS5003    │   │   │             │            │
│          │           │   │  │ - DHT11      │   │   │             │            │
│          │           │   │  └──────┬───────┘   │   │             │            │
│          │           │   │         │ UART      │   │             │            │
│          │           │   │         ▼           │   │             │            │
│          │           │   │  ┌──────────────┐   │   │             │            │
│          │           │   │  │  Main LCD    │   │   │             │            │
│          │           │   │  │  - Display   │   │   │             │            │
│          │           │   │  │  - Gateway   │   │   │             │            │
│          │           │   │  └──────┬───────┘   │   │             │            │
└──────────┼───────────┘   └─────────┼───────────┘   └─────────────┼────────────┘
           │ WiFi                    │ WiFi                        │ WiFi
           │                         │                             │
           └─────────────────────────┼─────────────────────────────┘
                                     │
╔═════════════════════════════════════════════════════════════════════════════════╗
║                              CLOUD BACKEND                                      ║
╚═════════════════════════════════════════════════════════════════════════════════╝
                                     │
                          ┌──────────▼──────────┐
                          │  Firebase Firestore │
                          │  Express.js API     │
                          │                     │
                          │  • Device Control   │
                          │  • Face Enrollment  │
                          │  • Sensor Data      │
                          │  • Door Lock Ctrl   │
                          └──────────┬──────────┘
                                     │ HTTPS
╔═════════════════════════════════════════════════════════════════════════════════╗
║                           WEB DASHBOARD                                         ║
╚═════════════════════════════════════════════════════════════════════════════════╝
                                     │
                          ┌──────────▼──────────┐
                          │   Next.js Frontend  │
                          │                     │
                          │  • Real-time View   │
                          │  • Device Control   │
                          │  • User Admin       │
                          └─────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════
DATA FLOWS:
═══════════════════════════════════════════════════════════════════════════════════

1. Room Sensors → [Mesh] → Main Mesh Hub → [UART] → Main LCD → [WiFi] → Backend
2. Camera → [SPI] → Doorbell LCD (w/ NFC) → [WiFi] → Backend
3. Door Lock → [WiFi] → Backend
4. Backend → [HTTPS] → Web Dashboard
```

## ✨ Key Features

### 🔐 Security & Access Control
- **AI-Powered Facial Recognition**: ESP-WHO framework running on ESP32-S3 for real-time face detection
- **NFC Authentication**: NFC scanner on doorbell for secure access control
- **WiFi-Connected Door Lock**: Servo-controlled lock with direct cloud communication
- **Face Enrollment System**: Web API for managing authorized users
- **Multi-Factor Authentication**: Combined face + NFC verification at doorbell

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
- **Video Streaming**: Real-time video and audio streaming to backend via websockets
- **Power Management**: Lazy WiFi initialization and camera low power stand-by mode to conserve energy

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
| Main LCD | ESP32 + RA8875 | Display and WiFi gateway |
| LCD Amplifier | ESP32s3 + MAX98357A | Audio output |
| Capacitive buttons | mpr121 | Touch Button Navigation |
| Microphone | INMP441 | 2 way audio communication with frontend |
| Knob | Rotary encoder | controlling UI |
| Power Supply | 20V -> 5v regulated | System power |


### Doorbell System
| Component | Model | Purpose |
|-----------|-------|---------|
| Camera Module | XIAO ESP32-S3 Sense | Facial recognition |
| Doorbell LCD | ESP32 + Display | Visitor interface |
| Audio Amplifier | ESP32s3 + MAX98357A | Audio output |
| NFC scanner | PN532 | Scanning NFC access cards |
| Power Supply | 5V regulated | System power |

### Distributed Sensors
| Component | Model | Purpose |
|-----------|-------|---------|
| Room Sensor Nodes | ESP32 + DHT22 | Temperature/humidity monitoring |
| Door Lock | ESP32 + Servo | Access control |
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
- **HTTP**:  API communication

## 🖥️ Frontend Application

The `Frontend` branch contains the Next.js web dashboard. Per the branch convention below, it is kept separate rather than merged into `main`. It has since been rebuilt on the "Glass" design system (see `src/app/globals.css`, `src/components/glass/`).

### Frontend Features

- 🔐 User Authentication (Login) with role-based access (Admin / User)
- 🏠 Real-time Device Control (doors, hub, doorbell, music broadcast)
- 📊 Sensor Data Visualization (temperature, humidity, gas/air quality, sparkline history)
- 👥 Admin Panel for User & NFC Card Management
- 📱 Responsive, glassmorphic Design
- 🔄 Live updates by polling the backend every 5 seconds (no WebSocket)

### Prerequisites

- Node.js (v18 or higher recommended for Next.js 16)
- npm
- Backend API running (see the `Backend` branch), or use the hosted API at `https://embedded-smarthome.fly.dev`

### Getting Started

```bash
# Install dependencies
npm install

# Start development server (points at a local backend on :5000)
npm run dev

# Start development server against the hosted/online backend
npm run online

# Build for production (points at the hosted backend)
npm run build

# Run the production build
npm start
```

The app runs at `http://localhost:3000` by default.

### Environment Variables

The API base URL is provided via `NEXT_PUBLIC_API_URL` (see the `dev`/`online`/`build` scripts in `package.json`), rather than a `.env` file:

```
NEXT_PUBLIC_API_URL=http://localhost:5000        # local backend
NEXT_PUBLIC_API_URL=https://embedded-smarthome.fly.dev  # hosted backend
```

### Project Structure

```
src/
├── app/            # Next.js App Router pages (dashboard, hub, doorbell, login)
├── components/
│   ├── auth/       # Login & route protection
│   ├── dashboard/  # Feature cards (alerts, doors, gas, temperature, NFC, admin, ...)
│   └── glass/      # Glass design system runtime (lens/blur effects, Sparkline, theme)
├── context/        # React Context providers (AuthContext)
├── services/       # API service clients (auth, devices, NFC)
├── types/          # TypeScript type definitions
└── utils/          # Utility functions (alert scoring, time formatting, cookies)
```

### ESP32 Device Integration

The frontend interfaces with:
- Main LCD Hub
- Room Sensors (via mesh)
- Doorbell LCD
- Doorbell Camera (Face Recognition)
- Door Lock

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
| **Main_lcd** | Main display and WiFi gateway | PlatformIO | 🔧 Working-State |
| **Main_amp** | Audio amplifier for main hub | PlatformIO | ✅ Complete |
| **Doorbell_Camera** | AI facial recognition camera | ESP-IDF | ✅ Complete |
| **Doorbell_lcd** | Doorbell display interface with NFC scanner | PlatformIO | ✅ Complete |
| **Doorbell_Amp** | Doorbell audio system | PlatformIO | ✅ Complete |
| **Door_lock** | WiFi-connected servo door lock | PlatformIO | ✅ Complete |
| **Room_Sensors** | Distributed environmental sensors | PlatformIO | ✅ Complete |

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
Developed by the Arduino888 team for 2110356 Embedded Systems (2025).

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
- Contact the development team through Github

---

**Built with ❤️ by Arduino888 Team | Chulalongkorn University 2025**
