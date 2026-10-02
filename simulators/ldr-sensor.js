/**
 * LDR Ambient Light Sensor Simulator
 * Publishes lux readings (0-1000) to MQTT topics:
 *   home/{buildingId}/{roomId}/lux
 *
 * Simulates realistic ambient light using a sinusoidal day/night cycle:
 *   - Peak lux (~900-1000) at solar noon
 *   - Minimum lux (~5-20) at midnight
 *   - Gaussian noise for realism
 */

const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const NUM_BUILDINGS = parseInt(process.env.NUM_BUILDINGS) || 1;
const ROOMS_PER_BUILDING = parseInt(process.env.ROOMS_PER_BUILDING) || 5;
const PUBLISH_INTERVAL_MS = parseInt(process.env.PUBLISH_INTERVAL_MS) || 1000;

class LDRSensor {
  constructor(buildingId, roomId) {
    this.buildingId = buildingId;
    this.roomId = roomId;
    this.deviceId = `${buildingId}-${roomId}-ldr`;
    // Each room has a slight offset to simulate different window orientations
    this.offset = Math.random() * 100 - 50;
  }

  /**
   * Generate lux reading using sinusoidal day/night cycle.
   * Uses current hour to compute position in cycle.
   * Adds Gaussian noise for realistic sensor behavior.
   */
  generateReading() {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;

    // Sinusoidal cycle: peak at 12:00 (noon), trough at 00:00 (midnight)
    // sin((hour - 6) * PI / 12) maps 06:00→0, 12:00→1, 18:00→0, 00:00→-1
    const sineValue = Math.sin(((hour - 6) * Math.PI) / 12);

    // Map to lux range: -1..1 → 0..1000
    const baseLux = ((sineValue + 1) / 2) * 900 + 10;

    // Add room-specific offset and Gaussian noise
    const noise = this.gaussianNoise() * 30;
    let lux = Math.round(baseLux + this.offset + noise);

    // Clamp to valid range
    lux = Math.max(0, Math.min(1000, lux));

    return lux;
  }

  /**
   * Box-Muller transform for Gaussian noise
   */
  gaussianNoise() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  getPayload() {
    const lux = this.generateReading();
    return {
      deviceId: this.deviceId,
      buildingId: this.buildingId,
      roomId: this.roomId,
      sensorType: 'lux',
      lux: lux,
      timestamp: new Date().toISOString(),
      messageId: uuidv4()
    };
  }

  getTopic() {
    return `home/${this.buildingId}/${this.roomId}/lux`;
  }
}

function startSimulation() {
  const client = mqtt.connect(BROKER_URL, {
    clientId: `ldr-simulator-${uuidv4().slice(0, 8)}`,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 3000
  });

  const sensors = [];

  for (let b = 1; b <= NUM_BUILDINGS; b++) {
    for (let r = 1; r <= ROOMS_PER_BUILDING; r++) {
      const buildingId = `building_${String(b).padStart(2, '0')}`;
      const roomId = `room_${String(r).padStart(2, '0')}`;
      sensors.push(new LDRSensor(buildingId, roomId));
    }
  }

  client.on('connect', () => {
    console.log(`[LDR Simulator] Connected to ${BROKER_URL}`);
    console.log(`[LDR Simulator] Simulating ${sensors.length} LDR sensors`);
    console.log(`[LDR Simulator] Publish interval: ${PUBLISH_INTERVAL_MS}ms`);

    setInterval(() => {
      sensors.forEach((sensor) => {
        const payload = sensor.getPayload();
        const topic = sensor.getTopic();
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            console.error(`[LDR] Error publishing to ${topic}:`, err.message);
          } else {
            console.log(`[LDR] ${sensor.deviceId} → ${payload.lux} lux`);
          }
        });
      });
    }, PUBLISH_INTERVAL_MS);
  });

  client.on('error', (err) => {
    console.error('[LDR Simulator] Connection error:', err.message);
  });

  client.on('reconnect', () => {
    console.log('[LDR Simulator] Reconnecting...');
  });

  process.on('SIGINT', () => {
    console.log('\n[LDR Simulator] Shutting down...');
    client.end(false, () => process.exit(0));
  });
}

module.exports = { LDRSensor };

if (require.main === module) {
  startSimulation();
}
