/**
 * Device Service
 * REST API + MQTT listener for device registration and status tracking.
 *
 * Responsibilities:
 *   - Register new devices on first message
 *   - Track lastSeen timestamp from heartbeats/messages
 *   - Mark devices offline after 60s without a message
 *   - Enrich raw events with room metadata before storage
 *   - Expose REST API for device CRUD
 */

const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const { DeviceManager } = require('./device-manager');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const PORT = process.env.DEVICE_SERVICE_PORT || 3001;
const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_home_lighting';

// MongoDB schemas
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  buildingId: { type: String, required: true },
  roomId: { type: String, required: true },
  type: { type: String, required: true, enum: ['pir', 'ldr', 'light'] },
  lastSeen: { type: Date, default: Date.now },
  status: { type: String, default: 'online', enum: ['online', 'offline'] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  registeredAt: { type: Date, default: Date.now }
});

const sensorReadingSchema = new mongoose.Schema({
  buildingId: { type: String, required: true, index: true },
  roomId: { type: String, required: true, index: true },
  sensorType: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  deviceId: String,
  enriched: { type: Boolean, default: false },
  avgLux: Number,
  timestamp: { type: Date, default: Date.now, index: true }
});

// Time-series-like compound index
sensorReadingSchema.index({ buildingId: 1, roomId: 1, timestamp: -1 });

const Device = mongoose.model('Device', deviceSchema, 'devices');
const SensorReading = mongoose.model('SensorReading', sensorReadingSchema, 'sensor_readings');

async function start() {
  console.log('[Device Service] Starting...');

  await mongoose.connect(MONGODB_URI);
  console.log('[Device Service] Connected to MongoDB');

  const deviceManager = new DeviceManager(Device);

  // Start offline checker (every 30s)
  const offlineChecker = setInterval(async () => {
    const count = await deviceManager.markOfflineDevices(60000);
    if (count > 0) {
      console.log(`[Device Service] Marked ${count} devices offline`);
    }
  }, 30000);

  // MQTT listener for auto-registration and enrichment
  const mqttClient = mqtt.connect(BROKER_URL, {
    clientId: `device-service-${process.pid}`,
    clean: true
  });

  mqttClient.on('connect', () => {
    console.log('[Device Service] Connected to MQTT broker');
    mqttClient.subscribe(['home/+/+/motion', 'home/+/+/lux'], { qos: 1 });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const event = JSON.parse(message.toString());
      const { deviceId, buildingId, roomId, sensorType } = event;

      // Auto-register device if new
      await deviceManager.registerOrUpdate(deviceId, {
        buildingId,
        roomId,
        type: sensorType === 'motion' ? 'pir' : 'ldr'
      });

      // Enrich and store reading
      const value = sensorType === 'motion' ? event.motion : event.lux;
      await SensorReading.create({
        buildingId,
        roomId,
        sensorType,
        value,
        deviceId,
        enriched: true,
        timestamp: event.timestamp || new Date()
      });
    } catch (err) {
      console.error('[Device Service] Error processing message:', err.message);
    }
  });

  // REST API
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'device-service', uptime: process.uptime() });
  });

  // List all devices
  app.get('/api/devices', async (req, res) => {
    try {
      const { buildingId, status, type } = req.query;
      const filter = {};
      if (buildingId) filter.buildingId = buildingId;
      if (status) filter.status = status;
      if (type) filter.type = type;

      const devices = await Device.find(filter).sort({ lastSeen: -1 });
      res.json({ count: devices.length, devices });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single device
  app.get('/api/devices/:deviceId', async (req, res) => {
    try {
      const device = await Device.findOne({ deviceId: req.params.deviceId });
      if (!device) return res.status(404).json({ error: 'Device not found' });
      res.json(device);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get sensor readings
  app.get('/api/readings', async (req, res) => {
    try {
      const { buildingId, roomId, sensorType, limit = 100 } = req.query;
      const filter = {};
      if (buildingId) filter.buildingId = buildingId;
      if (roomId) filter.roomId = roomId;
      if (sensorType) filter.sensorType = sensorType;

      const readings = await SensorReading.find(filter)
        .sort({ timestamp: -1 })
        .limit(parseInt(limit));
      res.json({ count: readings.length, readings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get device stats
  app.get('/api/stats', async (req, res) => {
    try {
      const totalDevices = await Device.countDocuments();
      const onlineDevices = await Device.countDocuments({ status: 'online' });
      const offlineDevices = await Device.countDocuments({ status: 'offline' });
      const totalReadings = await SensorReading.countDocuments();

      res.json({
        totalDevices,
        onlineDevices,
        offlineDevices,
        totalReadings,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[Device Service] REST API listening on port ${PORT}`);
  });

  process.on('SIGINT', async () => {
    console.log('\n[Device Service] Shutting down...');
    clearInterval(offlineChecker);
    mqttClient.end();
    await mongoose.disconnect();
    process.exit(0);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[Device Service] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { start };
