# ESP32_Embedded_Home
This is an IoT project simulating a full-fledged smart home ecosystem using ESP32 boards, developed in accordance with Chulalongkorn's 2110356 Embedded System class.

## Branches Explanation
- **3D-Models** - Holds project's 3D models for 3D printing (SketchUp and Cura files)
- **Main_lcd** - Holds code for main LCD hub (PlatformIO)
- **Main_mesh** - Secondary LCD which connects Main_lcd to sensor mesh (PlatformIO)
- **Room_Sensors** - Code for room sensors (PlatformIO)
- **Doorbell_lcd** - LCD for doorbell, communicates with Doorbell_Camera via SPI (PlatformIO)
- **Doorbell_Camera** - Code for Xiao ESP32-S3 Sense camera running AI face recognition, communicates with Doorbell_lcd using SPI (ESP-IDF)
## ⚠️ Important Workflow Note
**Each branch contains operational code for a different hardware module.**

- Each branch is **independent** and should **NOT** be merged together
- Do **NOT** merge branches together 😡😡😡
- ใครทำเเตกเเก้เองนะ 🫠

## Branch Usage
- Clone the branch you are assigned to!!!
- Keep the codes off main and in their respective branches :)

## Branch Commands

### View all branches
```bash
git branch -a
```
### Clone a specific branch
```bash
git clone -b <branch-name> <repository-url>
```
### Switch to your assigned branch
```bash
git switch <branch-name>
```
### Check Current Branch
```bash
git branch
```
