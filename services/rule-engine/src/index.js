/**
 * Rule Engine Service
 * Consumes sensor events from SQS, evaluates lighting rules,
 * and publishes actuation commands via MQTT.
 *
 * Rules:
 *   1. If motion=true AND lux < 200 → light ON
 *   2. If motion=true AND lux >= 200 AND lux < 500 → DIM:50
 *   3. If motion=false (for 5 min) → light OFF
 *   4. Time-of-day override: 22:00-06:00 → max brightness 30% (night mode)
 *
 * Debounce: minimum 30 seconds between state changes per room.
 */

const mqtt = require('mqtt');
const mongoose = require('mongoose');
const { RuleEvaluator } = require('./rule-evaluator');
const { SQSConsumer } = require('./sqs-consumer');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_home_lighting';
const SQS_QUEUE_URL = process.env.AWS_SQS_QUEUE_URL;
const SQS_ONLY = process.env.SQS_ONLY === 'true';

// Actuation log schema
const actuationLogSchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  buildingId: { type: String, required: true },
  command: { type: String, required: true, enum: ['ON', 'OFF', 'DIM:30', 'DIM:50'] },
  triggeredBy: { type: String, required: true },
  previousState: String,
  timestamp: { type: Date, default: Date.now, index: true }
});

const ActuationLog = mongoose.model('ActuationLog', actuationLogSchema, 'actuation_log');

async function start() {
  console.log('[Rule Engine] Starting...');

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  console.log('[Rule Engine] Connected to MongoDB');

  // Connect to MQTT (skip in SQS-only mode — no broker in Fargate)
  let mqttClient = null;
  if (!SQS_ONLY) {
    mqttClient = mqtt.connect(BROKER_URL, {
      clientId: `rule-engine-${process.pid}`,
      clean: true
    });

    await new Promise((resolve, reject) => {
      mqttClient.on('connect', resolve);
      mqttClient.on('error', reject);
    });
    console.log('[Rule Engine] Connected to MQTT broker');
  } else {
    console.log('[Rule Engine] SQS-only mode — skipping MQTT connection');
  }

  const ruleEvaluator = new RuleEvaluator();

  // Process sensor events
  async function processEvent(event) {
    try {
      const { buildingId, roomId, sensorType } = event;

      // Update room state in evaluator
      if (sensorType === 'motion') {
        ruleEvaluator.updateMotion(buildingId, roomId, event.motion);
      } else if (sensorType === 'lux') {
        ruleEvaluator.updateLux(buildingId, roomId, event.lux);
      }

      // Evaluate rules for this room
      const result = ruleEvaluator.evaluate(buildingId, roomId);

      if (result && result.action) {
        // Publish actuation command
        const cmdTopic = `home/${buildingId}/${roomId}/light/cmd`;
        const cmdPayload = {
          command: result.action,
          ruleId: result.ruleId,
          reason: result.reason,
          timestamp: new Date().toISOString()
        };

        mqttClient.publish(cmdTopic, JSON.stringify(cmdPayload), { qos: 1 });

        // Log to MongoDB
        await ActuationLog.create({
          roomId,
          buildingId,
          command: result.action,
          triggeredBy: result.ruleId,
          previousState: result.previousState,
          timestamp: new Date()
        });

        console.log(
          `[Rule Engine] ${buildingId}/${roomId}: ${result.action} (${result.reason})`
        );
      }
    } catch (err) {
      console.error('[Rule Engine] Error processing event:', err.message);
    }
  }

  // If SQS is configured, use SQS consumer; otherwise subscribe to MQTT directly
  if (SQS_QUEUE_URL) {
    console.log('[Rule Engine] Using SQS consumer mode');
    const consumer = new SQSConsumer(SQS_QUEUE_URL, processEvent);
    consumer.start();
  } else if (mqttClient) {
    console.log('[Rule Engine] Using direct MQTT subscription mode');
    mqttClient.subscribe(['home/+/+/motion', 'home/+/+/lux'], { qos: 1 });

    mqttClient.on('message', (topic, message) => {
      try {
        const event = JSON.parse(message.toString());
        processEvent(event);
      } catch (err) {
        console.error('[Rule Engine] Invalid message:', err.message);
      }
    });
  } else {
    console.error('[Rule Engine] No SQS_QUEUE_URL and no MQTT — nothing to consume');
    process.exit(1);
  }

  console.log('[Rule Engine] Running. Waiting for sensor events...');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Rule Engine] Shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

if (require.main === module) {
  start().catch((err) => {
    console.error('[Rule Engine] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { start };
