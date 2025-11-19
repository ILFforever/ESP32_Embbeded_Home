# Device Controller Tests

This directory contains comprehensive tests for all device controller functions.

## Test Coverage

The test suite covers all 11 exported functions from `controllers/devices.js`:

1. **registerDevice** - Device registration and token generation
2. **handleHeartbeat** - Device heartbeat with throttling logic
3. **handleSensorData** - Sensor data ingestion
4. **getDeviceStatus** - Retrieve individual device status
5. **getAllDevicesStatus** - Retrieve all devices with online/offline status
6. **getDeviceHistory** - Retrieve device history with pagination
7. **handleDoorbellRing** - Doorbell ring event handling
8. **handleFaceDetection** - Face detection with image upload
9. **handleHubLog** - Hub logging
10. **handleDoorbellStatus** - Update doorbell status
11. **getDoorbellStatus** - Retrieve doorbell status

## Running Tests

### Install dependencies
```bash
npm install
```

### Run all tests
```bash
npm test
```

### Run tests in watch mode (for development)
```bash
npm run test:watch
```

### Run tests with verbose output
```bash
npm run test:verbose
```

### Run specific test file
```bash
npx jest tests/devices.test.js
```

### Run specific test suite
```bash
npx jest -t "registerDevice"
```

## Test Structure

Each test suite includes:
- **Happy path tests** - Valid inputs and expected successful responses
- **Validation tests** - Missing/invalid parameters
- **Edge case tests** - Boundary conditions and special scenarios
- **Error handling tests** - Firebase errors, invalid JSON, missing auth

## Coverage Report

After running `npm test`, a coverage report is generated in the `coverage/` directory.

View coverage in browser:
```bash
open coverage/lcov-report/index.html
```

## Mocking

Tests use Jest mocks for:
- Firebase Firestore operations
- MQTT publishing
- File uploads (multer)

All mocks are reset before each test to ensure isolation.

## Test Data

Tests use realistic test data including:
- Device IDs (doorbell_001, hub_001, sensor_001)
- Sensor readings (temperature, humidity, CO2)
- Face detection data with confidence scores
- Heartbeat data with system metrics

## Adding New Tests

When adding new controller functions:

1. Add test suite to `devices.test.js`
2. Follow existing test structure
3. Include happy path, validation, and error tests
4. Update this README with new function coverage

## CI/CD Integration

These tests are designed to run in CI/CD pipelines:
- Fast execution (< 10 seconds)
- No external dependencies
- Isolated with mocks
- Clear pass/fail output
