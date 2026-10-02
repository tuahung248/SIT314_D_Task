/**
 * Integration Test Harness
 * Tests end-to-end pipeline: Sensor → MQTT → Rule Engine → Actuation
 * at 10, 100, and 1,000 device scale.
 *
 * Measures p95 latency from sensor publish to actuation command receipt.
 *
 * Usage: node scripts/integration-test.js [10|100|1000]
 */

const mqtt = require('mqtt');
require('dotenv').config();

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const DEVICE_COUNT = parseInt(process.argv[2]) || 10;
const TEST_DURATION_S = DEVICE_COUNT >= 1000 ? 600 : DEVICE_COUNT >= 100 ? 300 : 60;
const PUBLISH_INTERVAL_MS = 1000;

class IntegrationTest {
  constructor(deviceCount) {
    this.deviceCount = deviceCount;
    this.latencies = [];
    this.messagesPublished = 0;
    this.commandsReceived = 0;
    this.errors = 0;
    this.pendingMessages = new Map(); // messageId → publishTimestamp
  }

  async run() {
    console.log('=== Integration Test ===');
    console.log(`Devices: ${this.deviceCount}`);
    console.log(`Duration: ${TEST_DURATION_S}s`);
    console.log(`Broker: ${BROKER_URL}\n`);

    const publisher = mqtt.connect(BROKER_URL, {
      clientId: `int-test-pub-${Date.now()}`
    });

    const subscriber = mqtt.connect(BROKER_URL, {
      clientId: `int-test-sub-${Date.now()}`
    });

    await Promise.all([
      new Promise((resolve) => publisher.on('connect', resolve)),
      new Promise((resolve) => subscriber.on('connect', resolve))
    ]);

    // Subscribe to all actuation commands
    subscriber.subscribe('home/+/+/light/cmd', { qos: 1 });

    subscriber.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.timestamp) {
          const latency = Date.now() - new Date(payload.timestamp).getTime();
          this.latencies.push(latency);
          this.commandsReceived++;
        }
      } catch (err) {
        this.errors++;
      }
    });

    console.log('Publishing sensor data...\n');

    const startTime = Date.now();
    const interval = setInterval(() => {
      for (let d = 0; d < this.deviceCount; d++) {
        const buildingId = `building_${String(Math.floor(d / 10) + 1).padStart(2, '0')}`;
        const roomId = `room_${String((d % 10) + 1).padStart(2, '0')}`;

        // Publish motion
        const motionPayload = {
          deviceId: `${buildingId}-${roomId}-pir`,
          buildingId,
          roomId,
          sensorType: 'motion',
          motion: Math.random() > 0.5,
          timestamp: new Date().toISOString()
        };

        publisher.publish(
          `home/${buildingId}/${roomId}/motion`,
          JSON.stringify(motionPayload),
          { qos: 1 }
        );

        // Publish lux
        const luxPayload = {
          deviceId: `${buildingId}-${roomId}-ldr`,
          buildingId,
          roomId,
          sensorType: 'lux',
          lux: Math.floor(Math.random() * 1000),
          timestamp: new Date().toISOString()
        };

        publisher.publish(
          `home/${buildingId}/${roomId}/lux`,
          JSON.stringify(luxPayload),
          { qos: 1 }
        );

        this.messagesPublished += 2;
      }

      // Progress update every 10 seconds
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 10 === 0 && elapsed > 0) {
        const rate = Math.round(this.messagesPublished / elapsed);
        console.log(`  ${elapsed}s: ${this.messagesPublished} published, ${this.commandsReceived} commands, ${rate} msg/s`);
      }

      if (Date.now() - startTime >= TEST_DURATION_S * 1000) {
        clearInterval(interval);
        this.printResults();
        publisher.end();
        subscriber.end();
      }
    }, PUBLISH_INTERVAL_MS);
  }

  printResults() {
    console.log('\n=== Results ===');
    console.log(`Messages published: ${this.messagesPublished}`);
    console.log(`Commands received:  ${this.commandsReceived}`);
    console.log(`Errors:             ${this.errors}`);

    if (this.latencies.length > 0) {
      this.latencies.sort((a, b) => a - b);
      const p50 = this.latencies[Math.floor(this.latencies.length * 0.5)];
      const p95 = this.latencies[Math.floor(this.latencies.length * 0.95)];
      const p99 = this.latencies[Math.floor(this.latencies.length * 0.99)];
      const avg = Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length);

      console.log(`\nLatency (ms):`);
      console.log(`  p50:  ${p50}ms`);
      console.log(`  p95:  ${p95}ms  ${p95 < 500 ? '✅ PASS (<500ms)' : '❌ FAIL (≥500ms)'}`);
      console.log(`  p99:  ${p99}ms`);
      console.log(`  avg:  ${avg}ms`);
    } else {
      console.log('\nNo latency data collected (Rule Engine may not be running)');
    }

    console.log(`\nTest: ${this.deviceCount} devices — ${this.latencies.length > 0 && this.latencies[Math.floor(this.latencies.length * 0.95)] < 500 ? 'PASSED' : 'CHECK RESULTS'}`);
  }
}

const test = new IntegrationTest(DEVICE_COUNT);
test.run().catch(console.error);
