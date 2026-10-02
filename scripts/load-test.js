/**
 * Load / Scaling Test Script
 * Drives high message volume to trigger ECS auto-scaling.
 * Ramps from 100 to 1000 simulated devices over 10 minutes.
 *
 * For AWS: monitors SQS queue depth to trigger backlog-per-task scaling.
 * For local: generates MQTT load to observe system behaviour.
 *
 * Usage: node scripts/load-test.js
 */

const mqtt = require('mqtt');
require('dotenv').config();

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MAX_DEVICES = 1000;
const RAMP_STEPS = 10;
const STEP_DURATION_S = 60; // 1 minute per step
const PUBLISH_INTERVAL_MS = 1000;

async function runLoadTest() {
  console.log('=== Load / Scaling Test ===');
  console.log(`Broker: ${BROKER_URL}`);
  console.log(`Ramp: 100 → ${MAX_DEVICES} devices over ${RAMP_STEPS} steps`);
  console.log(`Step duration: ${STEP_DURATION_S}s\n`);

  const client = mqtt.connect(BROKER_URL, {
    clientId: `load-test-${Date.now()}`
  });

  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('error', reject);
  });

  let totalPublished = 0;
  let currentDeviceCount = 0;

  for (let step = 1; step <= RAMP_STEPS; step++) {
    currentDeviceCount = Math.floor((MAX_DEVICES / RAMP_STEPS) * step);

    console.log(`\n── Step ${step}/${RAMP_STEPS}: ${currentDeviceCount} devices ──`);

    const stepStart = Date.now();
    let stepPublished = 0;

    while (Date.now() - stepStart < STEP_DURATION_S * 1000) {
      for (let d = 0; d < currentDeviceCount; d++) {
        const buildingId = `building_${String(Math.floor(d / 20) + 1).padStart(2, '0')}`;
        const roomId = `room_${String((d % 20) + 1).padStart(2, '0')}`;

        const payload = {
          deviceId: `${buildingId}-${roomId}-pir`,
          buildingId,
          roomId,
          sensorType: Math.random() > 0.5 ? 'motion' : 'lux',
          motion: Math.random() > 0.5,
          lux: Math.floor(Math.random() * 1000),
          timestamp: new Date().toISOString()
        };

        const topic = payload.sensorType === 'motion'
          ? `home/${buildingId}/${roomId}/motion`
          : `home/${buildingId}/${roomId}/lux`;

        client.publish(topic, JSON.stringify(payload), { qos: 0 });
        stepPublished++;
        totalPublished++;
      }

      await new Promise((resolve) => setTimeout(resolve, PUBLISH_INTERVAL_MS));
    }

    const rate = Math.round(stepPublished / STEP_DURATION_S);
    console.log(`  Published: ${stepPublished} messages (${rate} msg/s)`);
    console.log(`  Total: ${totalPublished}`);
  }

  console.log('\n=== Load Test Complete ===');
  console.log(`Total messages published: ${totalPublished}`);
  console.log(`Peak device count: ${MAX_DEVICES}`);
  console.log('\n📸 Screenshot CloudWatch now to capture:');
  console.log('   - ECS task count (should have scaled up)');
  console.log('   - SQS queue depth (ApproximateNumberOfMessagesVisible)');
  console.log('   - CPU utilisation per task');

  client.end();
}

runLoadTest().catch(console.error);
