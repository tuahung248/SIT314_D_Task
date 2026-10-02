/**
 * PIR Motion Sensor Simulator
 * Publishes motion events (true/false) to MQTT topics:
 *   home/{buildingId}/{roomId}/motion
 *
 * Simulates realistic motion patterns:
 *   - Higher motion probability during daytime (06:00-22:00)
 *   - Random motion bursts to simulate occupancy
 *   - Configurable number of buildings and rooms
 */

const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const NUM_BUILDINGS = parseInt(process.env.NUM_BUILDINGS) || 1;
const ROOMS_PER_BUILDING = parseInt(process.env.ROOMS_PER_BUILDING) || 5;
const PUBLISH_INTERVAL_MS = parseInt(process.env.PUBLISH_INTERVAL_MS) || 1000;

class PIRSensor {
  constructor(buildingId, roomId) {
    this.buildingId = buildingId;
    this.roomId = roomId;
    this.deviceId = `${buildingId}-${roomId}-pir`;
    this.lastMotion = false;
    this.motionCooldown = 0;
  }

  /**
   * Simulate motion detection based on time-of-day probability.
   * Daytime (06:00-22:00): 30% chance of motion
   * Nighttime: 5% chance of motion
   * After motion detected: stays true for 3-8 cycles, then cools down
   */
  generateReading() {
    const hour = new Date().getHours();
    const isDaytime = hour >= 6 && hour < 22;
    const motionProbability = isDaytime ? 0.3 : 0.05;

    if (this.motionCooldown > 0) {
      this.motionCooldown--;
      return { motion: true };
    }

    if (this.lastMotion && Math.random() > 0.6) {
      // Motion continues for a few more cycles
      this.motionCooldown = Math.floor(Math.random() * 5) + 3;
      return { motion: true };
    }

    const motionDetected = Math.random() < motionProbability;
    this.lastMotion = motionDetected;

    if (motionDetected) {
      this.motionCooldown = Math.floor(Math.random() * 5) + 3;
    }

    return { motion: motionDetected };
  }

  getPayload() {
    const reading = this.generateReading();
    return {
      deviceId: this.deviceId,
      buildingId: this.buildingId,
      roomId: this.roomId,
      sensorType: 'motion',
      motion: reading.motion,
      timestamp: new Date().toISOString(),
      messageId: uuidv4()
    };
  }

  getTopic() {
    return `home/${this.buildingId}/${this.roomId}/motion`;
  }
}

function startSimulation() {
  const client = mqtt.connect(BROKER_URL, {
    clientId: `pir-simulator-${uuidv4().slice(0, 8)}`,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 3000
  });

  const sensors = [];

  for (let b = 1; b <= NUM_BUILDINGS; b++) {
    for (let r = 1; r <= ROOMS_PER_BUILDING; r++) {
      const buildingId = `building_${String(b).padStart(2, '0')}`;
      const roomId = `room_${String(r).padStart(2, '0')}`;
      sensors.push(new PIRSensor(buildingId, roomId));
    }
  }

  client.on('connect', () => {
    console.log(`[PIR Simulator] Connected to ${BROKER_URL}`);
    console.log(`[PIR Simulator] Simulating ${sensors.length} PIR sensors`);
    console.log(`[PIR Simulator] Publish interval: ${PUBLISH_INTERVAL_MS}ms`);

    setInterval(() => {
      sensors.forEach((sensor) => {
        const payload = sensor.getPayload();
        const topic = sensor.getTopic();
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
          if (err) {
            console.error(`[PIR] Error publishing to ${topic}:`, err.message);
          } else {
            const status = payload.motion ? 'MOTION DETECTED' : 'no motion';
            console.log(`[PIR] ${sensor.deviceId} → ${status}`);
          }
        });
      });
    }, PUBLISH_INTERVAL_MS);
  });

  client.on('error', (err) => {
    console.error('[PIR Simulator] Connection error:', err.message);
  });

  client.on('reconnect', () => {
    console.log('[PIR Simulator] Reconnecting...');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[PIR Simulator] Shutting down...');
    client.end(false, () => process.exit(0));
  });
}

// Export for testing
module.exports = { PIRSensor };

// Run if executed directly
if (require.main === module) {
  startSimulation();
}
