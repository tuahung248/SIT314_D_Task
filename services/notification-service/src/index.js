/**
 * Notification Service
 * Subscribes to actuation and alert topics via MQTT.
 * Sends notifications via webhook (Webhook.site) for anomalies and rule triggers.
 */

const mqtt = require('mqtt');
const { NotificationHandler } = require('./notification-handler');
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '..', '.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://webhook.site/test';

async function start() {
  console.log('[Notification Service] Starting...');

  const handler = new NotificationHandler({
    webhookUrl: WEBHOOK_URL
  });

  const mqttClient = mqtt.connect(BROKER_URL, {
    clientId: `notification-service-${process.pid}`,
    clean: true
  });

  mqttClient.on('connect', () => {
    console.log('[Notification Service] Connected to MQTT broker');

    // Subscribe to actuation commands and alert topics
    mqttClient.subscribe(
      [
        'home/+/+/light/cmd',        // All light commands
        'alerts/+',                    // System alerts
        'home/+/+/anomaly'            // Anomaly events
      ],
      { qos: 1 }
    );

    console.log('[Notification Service] Subscribed to command and alert topics');
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      const topicParts = topic.split('/');

      if (topic.includes('/light/cmd')) {
        // Actuation event
        await handler.handleActuation({
          buildingId: topicParts[1],
          roomId: topicParts[2],
          ...payload
        });
      } else if (topic.startsWith('alerts/')) {
        // System alert
        await handler.handleAlert({
          alertType: topicParts[1],
          ...payload
        });
      } else if (topic.includes('/anomaly')) {
        // Anomaly detected
        await handler.handleAnomaly({
          buildingId: topicParts[1],
          roomId: topicParts[2],
          ...payload
        });
      }
    } catch (err) {
      console.error('[Notification Service] Error processing message:', err.message);
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[Notification Service] Connection error:', err.message);
  });

  process.on('SIGINT', () => {
    console.log('\n[Notification Service] Shutting down...');
    mqttClient.end(false, () => process.exit(0));
  });

  console.log('[Notification Service] Running. Waiting for events...');
}

if (require.main === module) {
  start().catch((err) => {
    console.error('[Notification Service] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { start };
