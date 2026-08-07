const mockGetFirestore = jest.fn();
const mockSendAlertNotification = jest.fn();

jest.mock('../config/firebase', () => ({
  getFirestore: mockGetFirestore,
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: jest.fn(() => 'server-timestamp')
      }
    }
  }
}));

jest.mock('../config/mqtt', () => ({
  publishFaceDetection: jest.fn(),
  publishDeviceCommand: jest.fn()
}));

jest.mock('../utils/emailNotifications', () => ({
  sendAlertNotification: mockSendAlertNotification
}));

jest.mock('../utils/sensorThresholds', () => ({
  checkThresholdsAndAlert: jest.fn()
}));

jest.mock('../models/Alert', () => ({
  ALERT_LEVELS: {
    ERROR: 'ERROR',
    SUCCESS: 'SUCCESS'
  }
}));

const { acknowledgeCommand } = require('../controllers/devices');

describe('acknowledgeCommand stale status', () => {
  it('persists stale and does not send a failure notification', async () => {
    const commandRef = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ action: 'amp_play', params: {} })
      }),
      update: jest.fn().mockResolvedValue({})
    };
    const commandCollection = {
      doc: jest.fn().mockReturnValue(commandRef)
    };
    const deviceRef = {
      collection: jest.fn().mockReturnValue(commandCollection)
    };
    mockGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(deviceRef)
      })
    });

    const req = {
      body: {
        device_id: 'doorbell_001',
        command_id: 'stale_command_001',
        success: false,
        status: 'stale',
        error: 'Command expired after 600 seconds'
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await acknowledgeCommand(req, res);

    expect(commandRef.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'stale',
      error: 'Command expired after 600 seconds'
    }));
    expect(mockSendAlertNotification).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      message: 'Command acknowledgment received',
      command_status: 'stale'
    });
  });
});
