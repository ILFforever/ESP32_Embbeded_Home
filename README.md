# ESP32_Embbeded_Home
This is a IoT project simulating a full fledged smart home ecosystem using ESP32 boards, developed in according to  Chulalongkorn's 2110356 Embedded System class.

## Branches Explanation
- 3D-Models > holds project's 3d models for 3d printing (SketchUp and Cura files)
- Main_lcd > holds code for Main lcd hub (PlatformIO)
- Main_mesh > secondary lcd which connects Main_lcd to sensor mesh (PlatformIO)
- Room_Sensors > Code for room sensors (PlatformIO)
- Doorbell_lcd > Lcd for doorbell, communicate with Doorbell_Camera via SPI (PlatformIO)
- Doorbell_Camera > Code for Xiao Esp32s3 sense camera running AI face recognition communicates with Doorbell_lcd using SPI (ESP-IDF)

## Branch Usage
- Clone the branch you are assigned to!!!
- keep the codes off main and in their respective branches :)
