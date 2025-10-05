# Doorbell Camera Module

ESP32-S3 camera module for smart doorbell system with facial recognition.

## Overview

This module captures video frames, performs real-time face detection/recognition using ESP-WHO, and communicates results to the Doorbell_LCD module via SPI.

## Hardware

- **Board**: XIAO ESP32-S3 Sense
- **Camera**: DVP interface
- **Storage**: SPI flash for face database
- **Communication**: SPI to LCD module

## Features

- Real-time facial recognition
- Face enrollment and management
- Power-saving standby mode
- WiFi + HTTP control interface
- LED status indicator
