/**
 * Light Bulb Actuator Simulator
 * Subscribes to command topics and logs state changes:
 *   home/{buildingId}/{roomId}/light/cmd
 *
 * Accepts commands: ON, OFF, DIM:<level>
 * Logs all state transitions for verification.
 */

const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BROKER_URL = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const NUM_BUILDINGS = parseInt(process.env.NUM_BUILDINGS) || 1;
const ROOMS_PER_BUILDING = parseInt(process.env.ROOMS_PER_BUILDING) || 5;

class LightActuator {
  constructor(buildingId, roomId) {
    this.buildingId = buildingId;
    this.roomId = roomId;
    this.deviceId = `${buildingId}-${roomId}-light`;
    this.state = 'OFF';
    this.brightness = 0;
    this.stateLog = [];
  }

  getTopic() {
    return `home/${this.buildingId}/${this.roomId}/light/cmd`;
  }

  handleCommand(command) {
    const previousState = this.state;
    const previousBrightness = this.brightness;

    if (command === 'ON') {
      this.state = 'ON';
      this.brightness = 100;
    } else if (command === 'OFF') {
      this.state = 'OFF';
      this.brightness = 0;
    } else if (command.startsWith('DIM:')) {
      const level = parseInt(command.split(':')[1]);
      if (!isNaN(level) && level >= 0 && level <= 100) {
        this.state = level > 0 ? 'ON' : 'OFF';
        this.brightness = level;
      } else {
        console.warn(`[LIGHT] ${this.deviceId} — Invalid DIM level: ${command}`);
        return null;
      }
    } else {
      console.warn(`[LIGHT] ${this.deviceId} — Unknown command: ${command}`);
      return null;
    }

    const logEntry = {
      deviceId: this.deviceId,
      roomId: this.roomId,
      buildingId: this.buildingId,
      previousState,
      previousBrightness,
      newState: this.state,
      newBrightness: this.brightness,
      command,
      timestamp: new Date().toISOString()
    };

    this.stateLog.push(logEntry);
    return logEntry;
  }
}

function startSimulation() {
  const client = mqtt.connect(BROKER_URL, {
    clientId: `actuator-simulator-${uuidv4().slice(0, 8)}`,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 3000
  });

  const actuators = new Map();
  const subscribeTopics = [];

  for (let b = 1; b <= NUM_BUILDINGS; b++) {
    for (let r = 1; r <= ROOMS_PER_BUILDING; r++) {
      const buildingId = `building_${String(b).padStart(2, '0')}`;
      const roomId = `room_${String(r).padStart(2, '0')}`;
      const actuator = new LightActuator(buildingId, roomId);
      actuators.set(actuator.getTopic(), actuator);
      subscribeTopics.push(actuator.getTopic());
    }
  }

  client.on('connect', () => {
    console.log(`[Actuator Simulator] Connected to ${BROKER_URL}`);
    console.log(`[Actuator Simulator] Managing ${actuators.size} light actuators`);

    // Subscribe to all command topics
    // Use wildcard: home/+/+/light/cmd
    client.subscribe('home/+/+/light/cmd', { qos: 1 }, (err) => {
      if (err) {
        console.error('[Actuator] Subscribe error:', err.message);
      } else {
        console.log('[Actuator] Subscribed to home/+/+/light/cmd');
      }
    });
  });

  client.on('message', (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      const command = payload.command || message.toString().trim();

      // Find or create actuator for this topic
      let actuator = actuators.get(topic);
      if (!actuator) {
        // Extract buildingId and roomId from topic
        const parts = topic.split('/');
        if (parts.length >= 4) {
          actuator = new LightActuator(parts[1], parts[2]);
          actuators.set(topic, actuator);
        }
      }

      if (actuator) {
        const result = actuator.handleCommand(
          typeof command === 'string' ? command : payload.command
        );
        if (result) {
          console.log(
            `[LIGHT] ${result.deviceId}: ${result.previousState}(${result.previousBrightness}%) → ${result.newState}(${result.newBrightness}%) [cmd: ${result.command}]`
          );
        }
      }
    } catch (err) {
      console.error('[Actuator] Error processing message:', err.message);
    }
  });

  client.on('error', (err) => {
    console.error('[Actuator Simulator] Connection error:', err.message);
  });

  process.on('SIGINT', () => {
    console.log('\n[Actuator Simulator] Shutting down...');
    // Print summary
    actuators.forEach((actuator) => {
      console.log(
        `  ${actuator.deviceId}: ${actuator.stateLog.length} state changes`
      );
    });
    client.end(false, () => process.exit(0));
  });
}

module.exports = { LightActuator };

if (require.main === module) {
  startSimulation();
}
