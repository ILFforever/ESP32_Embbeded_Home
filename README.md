# ESP32_Embedded_Home - 3D Models
This branch contains all 3D printable enclosures and mounting hardware for the smart home system.

### List of Models:
1. **Doorbell Enclosure** - Housing for doorbell LCD and camera module
2. **Sensor Module Case** - Protective enclosure for room sensors
3. **Main Hub Housing** - Enclosure for the central LCD control hub

### Modeling
- **Software:** SketchUp
- Design with print orientation in mind
- Ensure proper tolerances for ESP32 boards and components

### Slicing & Printing
- **Slicer:** Cura

## File Structure
should follow the following
```
Models/
├── Doorbell/
│   ├── doorbell_enclosure.skp
│   └── doorbell_enclosure.stl
├── Sensor_Module/
│   ├── sensor_case.skp
│   └── sensor_case.stl
├── Main_Hub/
|   ├── hub_housing.skp
|   └── hub_housing.stl
```
*add any design notes if needed*

## Design Notes
- All models designed to fit standard ESP32 boards
- Includes mounting points for secure component placement
- use the same sizescaling for all models
- Do not forget to give 1-2 millimeters for torlerance 
