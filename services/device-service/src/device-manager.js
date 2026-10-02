/**
 * DeviceManager
 * Handles device registration, status tracking, and offline detection.
 */

class DeviceManager {
  constructor(DeviceModel) {
    this.Device = DeviceModel;
    this.OFFLINE_THRESHOLD_MS = 60000; // 60 seconds
  }

  /**
   * Register a new device or update lastSeen for existing one.
   */
  async registerOrUpdate(deviceId, data) {
    const now = new Date();
    const device = await this.Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          buildingId: data.buildingId,
          roomId: data.roomId,
          type: data.type,
          lastSeen: now,
          status: 'online'
        },
        $setOnInsert: {
          registeredAt: now
        }
      },
      { upsert: true, new: true }
    );
    return device;
  }

  /**
   * Mark devices as offline if not seen within threshold.
   * Returns count of devices marked offline.
   */
  async markOfflineDevices(thresholdMs) {
    const threshold = thresholdMs || this.OFFLINE_THRESHOLD_MS;
    const cutoff = new Date(Date.now() - threshold);

    const result = await this.Device.updateMany(
      { status: 'online', lastSeen: { $lt: cutoff } },
      { $set: { status: 'offline' } }
    );

    return result.modifiedCount;
  }

  /**
   * Get device by ID.
   */
  async getDevice(deviceId) {
    return this.Device.findOne({ deviceId });
  }

  /**
   * Get all devices for a building.
   */
  async getDevicesByBuilding(buildingId) {
    return this.Device.find({ buildingId }).sort({ roomId: 1 });
  }

  /**
   * Get device counts by status.
   */
  async getStatusCounts() {
    const online = await this.Device.countDocuments({ status: 'online' });
    const offline = await this.Device.countDocuments({ status: 'offline' });
    return { online, offline, total: online + offline };
  }

  /**
   * Determine device type from sensorType string.
   */
  static resolveDeviceType(sensorType) {
    switch (sensorType) {
      case 'motion':
        return 'pir';
      case 'lux':
        return 'ldr';
      case 'light':
        return 'light';
      default:
        return 'unknown';
    }
  }
}

module.exports = { DeviceManager };
