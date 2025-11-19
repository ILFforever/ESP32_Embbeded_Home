const request = require('supertest');
const app = require('../server');
const { getFirestore, admin } = require('../config/firebase');
const crypto = require('crypto');

// Mock Firebase
jest.mock('../config/firebase');
jest.mock('../config/mqtt', () => ({
  publishFaceDetection: jest.fn()
}));

describe('Device Controller Tests', () => {
  let db;
  let mockDeviceRef;
  let mockCollection;
  let validDeviceToken;

  beforeAll(() => {
    // Generate a valid test token
    validDeviceToken = crypto.randomBytes(32).toString('hex');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Firestore methods
    mockCollection = {
      doc: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      get: jest.fn(),
      add: jest.fn()
    };

    mockDeviceRef = {
      set: jest.fn().mockResolvedValue({}),
      get: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      collection: jest.fn().mockReturnValue(mockCollection)
    };

    db = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDeviceRef),
        where: jest.fn().mockReturnValue(mockCollection),
        get: jest.fn()
      })
    };

    getFirestore.mockReturnValue(db);

    // Mock admin.firestore methods
    admin.firestore = {
      FieldValue: {
        serverTimestamp: jest.fn(() => new Date()),
        delete: jest.fn()
      },
      Timestamp: {
        fromDate: jest.fn((date) => ({ toDate: () => date }))
      }
    };
  });

  // ============================================================================
  // 1. TEST: registerDevice
  // ============================================================================
  describe('POST /api/v1/devices/register', () => {
    it('should register a new device and return API token', async () => {
      const newDevice = {
        device_id: 'test_device_001',
        device_type: 'doorbell',
        name: 'Test Doorbell'
      };

      mockDeviceRef.get.mockResolvedValue({
        exists: false
      });

      const response = await request(app)
        .post('/api/v1/devices/register')
        .send(newDevice)
        .expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.device_id).toBe(newDevice.device_id);
      expect(response.body.api_token).toBeDefined();
      expect(response.body.api_token).toHaveLength(64);
      expect(mockDeviceRef.set).toHaveBeenCalled();
    });

    it('should return error if device already exists', async () => {
      const existingDevice = {
        device_id: 'existing_device_001',
        device_type: 'hub',
        name: 'Existing Hub'
      };

      mockDeviceRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ device_id: 'existing_device_001' })
      });

      const response = await request(app)
        .post('/api/v1/devices/register')
        .send(existingDevice)
        .expect(409);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('already registered');
    });

    it('should return 400 if device_id is missing', async () => {
      const invalidDevice = {
        device_type: 'doorbell',
        name: 'Test'
      };

      const response = await request(app)
        .post('/api/v1/devices/register')
        .send(invalidDevice)
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('device_id and device_type are required');
    });

    it('should return 400 if device_type is missing', async () => {
      const invalidDevice = {
        device_id: 'test_001',
        name: 'Test'
      };

      const response = await request(app)
        .post('/api/v1/devices/register')
        .send(invalidDevice)
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 2. TEST: handleHeartbeat
  // ============================================================================
  describe('POST /api/v1/devices/heartbeat', () => {
    it('should accept valid heartbeat and return throttle info', async () => {
      const heartbeatData = {
        device_id: 'doorbell_001',
        uptime_ms: 120000,
        free_heap: 50000,
        wifi_rssi: -45,
        ip_address: '192.168.1.100'
      };

      mockDeviceRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ device_id: 'doorbell_001' })
      });

      const response = await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(heartbeatData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.message).toBe('Heartbeat received');
      expect(response.body.written).toBeDefined();
      expect(response.body.has_pending_commands).toBeDefined();
    });

    it('should return 400 if device_id is missing', async () => {
      const invalidHeartbeat = {
        uptime_ms: 120000,
        free_heap: 50000
      };

      const response = await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(invalidHeartbeat)
        .expect(400);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('device_id is required');
    });

    it('should throttle writes within 5 minute window', async () => {
      const heartbeatData = {
        device_id: 'doorbell_001',
        uptime_ms: 120000,
        free_heap: 50000
      };

      // First heartbeat - should write
      await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(heartbeatData)
        .expect(200);

      // Second heartbeat immediately after - should be throttled
      const response = await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(heartbeatData)
        .expect(200);

      expect(response.body.written).toBe(false);
    });
  });

  // ============================================================================
  // 3. TEST: handleSensorData
  // ============================================================================
  describe('POST /api/v1/devices/sensor', () => {
    it('should accept and store sensor data', async () => {
      const sensorData = {
        device_id: 'sensor_001',
        sensors: {
          temperature: 25.5,
          humidity: 60,
          co2: 400
        }
      };

      mockCollection.add.mockResolvedValue({ id: 'sensor_doc_id' });

      const response = await request(app)
        .post('/api/v1/devices/sensor')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(sensorData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.message).toBe('Sensor data received');
      expect(mockCollection.add).toHaveBeenCalled();
    });

    it('should return 400 if device_id is missing', async () => {
      const invalidSensorData = {
        sensors: { temperature: 25 }
      };

      const response = await request(app)
        .post('/api/v1/devices/sensor')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(invalidSensorData)
        .expect(400);

      expect(response.body.status).toBe('error');
    });

    it('should return 400 if sensors object is missing', async () => {
      const invalidSensorData = {
        device_id: 'sensor_001'
      };

      const response = await request(app)
        .post('/api/v1/devices/sensor')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(invalidSensorData)
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 4. TEST: getDeviceStatus
  // ============================================================================
  describe('GET /api/v1/devices/:device_id/status', () => {
    it('should return device status if exists', async () => {
      const deviceId = 'doorbell_001';
      const mockStatus = {
        online: true,
        last_seen: new Date(),
        uptime_ms: 120000
      };

      mockDeviceRef.get.mockResolvedValue({
        exists: true,
        data: () => mockStatus
      });

      const response = await request(app)
        .get(`/api/v1/devices/${deviceId}/status`)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.device_id).toBe(deviceId);
      expect(response.body.data).toBeDefined();
    });

    it('should return 404 if device not found', async () => {
      const deviceId = 'nonexistent_device';

      mockDeviceRef.get.mockResolvedValue({
        exists: false
      });

      const response = await request(app)
        .get(`/api/v1/devices/${deviceId}/status`)
        .expect(404);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('not found');
    });
  });

  // ============================================================================
  // 5. TEST: getAllDevicesStatus
  // ============================================================================
  describe('GET /api/v1/devices/status/all', () => {
    it('should return all devices with online status', async () => {
      const mockDevices = [
        {
          id: 'doorbell_001',
          data: () => ({
            device_id: 'doorbell_001',
            type: 'doorbell',
            online: true,
            last_seen: new Date()
          })
        },
        {
          id: 'hub_001',
          data: () => ({
            device_id: 'hub_001',
            type: 'hub',
            online: false,
            last_seen: new Date(Date.now() - 300000)
          })
        }
      ];

      db.collection.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          docs: mockDevices
        })
      });

      const response = await request(app)
        .get('/api/v1/devices/status/all')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.summary).toBeDefined();
      expect(response.body.summary.total).toBe(2);
      expect(response.body.devices).toHaveLength(2);
    });

    it('should return empty array if no devices', async () => {
      db.collection.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          docs: []
        })
      });

      const response = await request(app)
        .get('/api/v1/devices/status/all')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.summary.total).toBe(0);
      expect(response.body.devices).toHaveLength(0);
    });
  });

  // ============================================================================
  // 6. TEST: getDeviceHistory
  // ============================================================================
  describe('GET /api/v1/devices/:device_id/history', () => {
    it('should return device history with default limit', async () => {
      const deviceId = 'doorbell_001';
      const mockHistory = [
        { id: '1', data: () => ({ temperature: 25, timestamp: new Date() }) },
        { id: '2', data: () => ({ temperature: 26, timestamp: new Date() }) }
      ];

      mockCollection.orderBy.mockReturnThis();
      mockCollection.limit.mockReturnThis();
      mockCollection.get.mockResolvedValue({
        docs: mockHistory
      });

      const response = await request(app)
        .get(`/api/v1/devices/${deviceId}/history`)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.device_id).toBe(deviceId);
      expect(response.body.data).toHaveLength(2);
    });

    it('should respect custom limit parameter', async () => {
      const deviceId = 'doorbell_001';
      const limit = 5;

      mockCollection.orderBy.mockReturnThis();
      mockCollection.limit.mockReturnThis();
      mockCollection.get.mockResolvedValue({ docs: [] });

      await request(app)
        .get(`/api/v1/devices/${deviceId}/history?limit=${limit}`)
        .expect(200);

      expect(mockCollection.limit).toHaveBeenCalledWith(limit);
    });
  });

  // ============================================================================
  // 7. TEST: handleDoorbellRing
  // ============================================================================
  describe('POST /api/v1/devices/doorbell/ring', () => {
    it('should accept doorbell ring event', async () => {
      const ringData = {
        device_id: 'doorbell_001',
        timestamp: new Date().toISOString()
      };

      mockCollection.add.mockResolvedValue({ id: 'event_id' });

      const response = await request(app)
        .post('/api/v1/devices/doorbell/ring')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(ringData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.event_id).toBeDefined();
      expect(mockCollection.add).toHaveBeenCalled();
    });

    it('should return 400 if device_id is missing', async () => {
      const response = await request(app)
        .post('/api/v1/devices/doorbell/ring')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send({})
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 8. TEST: handleFaceDetection
  // ============================================================================
  describe('POST /api/v1/devices/doorbell/face-detection', () => {
    it('should accept face detection with image upload', async () => {
      const mockFile = Buffer.from('fake-image-data');

      mockCollection.add.mockResolvedValue({ id: 'face_event_id' });

      const response = await request(app)
        .post('/api/v1/devices/doorbell/face-detection')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .field('device_id', 'doorbell_001')
        .field('recognized', 'true')
        .field('name', 'John Doe')
        .field('confidence', '0.95')
        .attach('image', mockFile, 'face.jpg')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.event_id).toBeDefined();
    });

    it('should accept face detection without image', async () => {
      const faceData = {
        device_id: 'doorbell_001',
        recognized: false,
        name: 'Unknown',
        confidence: 0.0
      };

      mockCollection.add.mockResolvedValue({ id: 'face_event_id' });

      const response = await request(app)
        .post('/api/v1/devices/doorbell/face-detection')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(faceData)
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should return 400 if device_id is missing', async () => {
      const response = await request(app)
        .post('/api/v1/devices/doorbell/face-detection')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send({ recognized: true })
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 9. TEST: handleHubLog
  // ============================================================================
  describe('POST /api/v1/devices/hub/log', () => {
    it('should accept hub log entry', async () => {
      const logData = {
        device_id: 'hub_001',
        level: 'info',
        message: 'System started',
        data: { uptime: 120000 }
      };

      mockCollection.add.mockResolvedValue({ id: 'log_id' });

      const response = await request(app)
        .post('/api/v1/devices/hub/log')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(logData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(mockCollection.add).toHaveBeenCalled();
    });

    it('should return 400 if device_id is missing', async () => {
      const response = await request(app)
        .post('/api/v1/devices/hub/log')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send({ level: 'info', message: 'test' })
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 10. TEST: handleDoorbellStatus
  // ============================================================================
  describe('POST /api/v1/devices/doorbell/status', () => {
    it('should update doorbell status', async () => {
      const statusData = {
        device_id: 'doorbell_001',
        camera_active: true,
        mic_active: false,
        recording: true,
        motion_detected: false
      };

      const response = await request(app)
        .post('/api/v1/devices/doorbell/status')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send(statusData)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.message).toBe('Doorbell status updated');
    });

    it('should return 400 if device_id is missing', async () => {
      const response = await request(app)
        .post('/api/v1/devices/doorbell/status')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .send({ camera_active: true })
        .expect(400);

      expect(response.body.status).toBe('error');
    });
  });

  // ============================================================================
  // 11. TEST: getDoorbellStatus
  // ============================================================================
  describe('GET /api/v1/devices/doorbell/:device_id/status', () => {
    it('should return doorbell status if exists', async () => {
      const deviceId = 'doorbell_001';
      const mockStatus = {
        camera_active: true,
        mic_active: false,
        recording: true
      };

      mockCollection.doc.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockStatus
        })
      });

      const response = await request(app)
        .get(`/api/v1/devices/doorbell/${deviceId}/status`)
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.device_id).toBe(deviceId);
      expect(response.body.data).toEqual(mockStatus);
    });

    it('should return 404 if doorbell status not found', async () => {
      const deviceId = 'doorbell_001';

      mockCollection.doc.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: false
        })
      });

      const response = await request(app)
        .get(`/api/v1/devices/doorbell/${deviceId}/status`)
        .expect(404);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toContain('No doorbell status found');
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle Firebase errors gracefully', async () => {
      mockDeviceRef.get.mockRejectedValue(new Error('Firebase connection error'));

      const response = await request(app)
        .get('/api/v1/devices/test_device/status')
        .expect(500);

      expect(response.body.status).toBe('error');
    });

    it('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${validDeviceToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json{')
        .expect(400);
    });

    it('should handle missing authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/devices/heartbeat')
        .send({ device_id: 'test' })
        .expect(401);
    });
  });
});
