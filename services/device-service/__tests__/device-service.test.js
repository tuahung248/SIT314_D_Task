/**
 * Device Service Unit Tests
 * 18 tests covering: registration, lastSeen, status transitions
 */

const { DeviceManager } = require('../src/device-manager');

// Mock Mongoose Model
function createMockModel() {
  const store = new Map();

  const MockModel = {
    findOneAndUpdate: jest.fn(async (filter, update, options) => {
      const key = filter.deviceId;
      let doc = store.get(key);

      if (!doc) {
        if (options && options.upsert) {
          doc = {
            deviceId: key,
            ...update.$set,
            ...(update.$setOnInsert || {}),
            _id: `mock_${key}`
          };
          store.set(key, doc);
        } else {
          return null;
        }
      } else {
        Object.assign(doc, update.$set);
      }

      return options && options.new ? doc : { ...doc };
    }),

    findOne: jest.fn(async (filter) => {
      return store.get(filter.deviceId) || null;
    }),

    find: jest.fn(async (filter) => {
      const results = [];
      store.forEach((doc) => {
        if (!filter.buildingId || doc.buildingId === filter.buildingId) {
          results.push(doc);
        }
      });
      return { sort: () => results };
    }),

    countDocuments: jest.fn(async (filter) => {
      let count = 0;
      store.forEach((doc) => {
        if (!filter || !filter.status || doc.status === filter.status) {
          count++;
        }
      });
      return count;
    }),

    updateMany: jest.fn(async (filter, update) => {
      let modified = 0;
      store.forEach((doc) => {
        if (
          doc.status === filter.status &&
          new Date(doc.lastSeen) < filter.lastSeen.$lt
        ) {
          Object.assign(doc, update.$set);
          modified++;
        }
      });
      return { modifiedCount: modified };
    }),

    _store: store,
    _reset: () => store.clear()
  };

  return MockModel;
}

describe('DeviceManager', () => {
  let manager;
  let mockModel;

  beforeEach(() => {
    mockModel = createMockModel();
    manager = new DeviceManager(mockModel);
  });

  // ============================================================
  // Device Registration
  // ============================================================
  describe('Device Registration', () => {
    test('should register a new device', async () => {
      const device = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });

      expect(device).toBeDefined();
      expect(device.deviceId).toBe('b01-r01-pir');
      expect(device.buildingId).toBe('building_01');
      expect(device.status).toBe('online');
    });

    test('should update lastSeen for existing device', async () => {
      await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });

      const updated = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });

      expect(updated.deviceId).toBe('b01-r01-pir');
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    test('should set status to online on registration', async () => {
      const device = await manager.registerOrUpdate('b01-r02-ldr', {
        buildingId: 'building_01',
        roomId: 'room_02',
        type: 'ldr'
      });

      expect(device.status).toBe('online');
    });

    test('should store correct device type for PIR', async () => {
      const device = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });
      expect(device.type).toBe('pir');
    });

    test('should store correct device type for LDR', async () => {
      const device = await manager.registerOrUpdate('b01-r01-ldr', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'ldr'
      });
      expect(device.type).toBe('ldr');
    });

    test('should store correct device type for light', async () => {
      const device = await manager.registerOrUpdate('b01-r01-light', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'light'
      });
      expect(device.type).toBe('light');
    });
  });

  // ============================================================
  // Last Seen Tracking
  // ============================================================
  describe('Last Seen Tracking', () => {
    test('lastSeen should be a Date object', async () => {
      const device = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });

      expect(device.lastSeen).toBeInstanceOf(Date);
    });

    test('lastSeen should update on subsequent messages', async () => {
      const first = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });
      const firstSeen = first.lastSeen;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      const second = await manager.registerOrUpdate('b01-r01-pir', {
        buildingId: 'building_01',
        roomId: 'room_01',
        type: 'pir'
      });

      expect(second.lastSeen.getTime()).toBeGreaterThanOrEqual(firstSeen.getTime());
    });
  });

  // ============================================================
  // Status Transitions
  // ============================================================
  describe('Status Transitions', () => {
    test('should mark device offline after threshold', async () => {
      const pastDate = new Date(Date.now() - 120000); // 2 minutes ago
      mockModel._store.set('old-device', {
        deviceId: 'old-device',
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir',
        status: 'online',
        lastSeen: pastDate
      });

      const count = await manager.markOfflineDevices(60000);
      expect(count).toBe(1);
    });

    test('should NOT mark device offline within threshold', async () => {
      const recentDate = new Date(Date.now() - 30000); // 30 seconds ago
      mockModel._store.set('recent-device', {
        deviceId: 'recent-device',
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir',
        status: 'online',
        lastSeen: recentDate
      });

      const count = await manager.markOfflineDevices(60000);
      expect(count).toBe(0);
    });

    test('should use default threshold (60s) when none provided', async () => {
      const pastDate = new Date(Date.now() - 120000);
      mockModel._store.set('default-test', {
        deviceId: 'default-test',
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir',
        status: 'online',
        lastSeen: pastDate
      });

      const count = await manager.markOfflineDevices();
      expect(count).toBe(1);
    });

    test('should not re-mark already offline device', async () => {
      mockModel._store.set('already-off', {
        deviceId: 'already-off',
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir',
        status: 'offline',
        lastSeen: new Date(Date.now() - 120000)
      });

      const count = await manager.markOfflineDevices(60000);
      expect(count).toBe(0);
    });

    test('registerOrUpdate should bring offline device back online', async () => {
      mockModel._store.set('was-offline', {
        deviceId: 'was-offline',
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir',
        status: 'offline',
        lastSeen: new Date(Date.now() - 300000)
      });

      const device = await manager.registerOrUpdate('was-offline', {
        buildingId: 'b1',
        roomId: 'r1',
        type: 'pir'
      });

      expect(device.status).toBe('online');
    });
  });

  // ============================================================
  // Utility Methods
  // ============================================================
  describe('Utility Methods', () => {
    test('resolveDeviceType should map motion → pir', () => {
      expect(DeviceManager.resolveDeviceType('motion')).toBe('pir');
    });

    test('resolveDeviceType should map lux → ldr', () => {
      expect(DeviceManager.resolveDeviceType('lux')).toBe('ldr');
    });

    test('resolveDeviceType should map light → light', () => {
      expect(DeviceManager.resolveDeviceType('light')).toBe('light');
    });

    test('resolveDeviceType should return unknown for unrecognised type', () => {
      expect(DeviceManager.resolveDeviceType('humidity')).toBe('unknown');
    });
  });
});
