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

const { acknowledgeCommand, fetchPendingCommands } = require('../controllers/devices');

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

describe('fetchPendingCommands backend expiry', () => {
  it('marks expired commands stale and returns a bounded fresh batch', async () => {
    const now = Date.now();
    const staleRef = {
      update: jest.fn().mockResolvedValue({})
    };
    const staleDoc = {
      id: 'stale_command',
      ref: staleRef,
      data: () => ({
        action: 'amp_restart',
        params: {},
        created_at: { toMillis: () => now - (10 * 60 * 1000) }
      })
    };
    const freshDocs = Array.from({ length: 6 }, (_, index) => ({
      id: `fresh_command_${index + 1}`,
      ref: { update: jest.fn() },
      data: () => ({
        action: 'amp_play',
        params: { track: index + 1 },
        created_at: { toMillis: () => now - 1000 }
      })
    }));
    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [staleDoc, ...freshDocs] })
    };
    const deviceRef = {
      collection: jest.fn().mockReturnValue(query)
    };
    mockGetFirestore.mockReturnValue({
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue(deviceRef)
      })
    });

    const req = { body: { device_id: 'doorbell_001' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await fetchPendingCommands(req, res);

    expect(staleRef.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'stale',
      error: expect.stringContaining('Command expired after')
    }));
    expect(res.json).toHaveBeenCalledWith({
      status: 'ok',
      count: 5,
      has_more: true,
      commands: freshDocs.slice(0, 5).map((doc) => ({
        id: doc.id,
        action: 'amp_play',
        params: doc.data().params
      }))
    });
  });
});
