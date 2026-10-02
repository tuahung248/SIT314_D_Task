/**
 * RuleEvaluator
 * Core business logic for evaluating lighting rules.
 *
 * Rules:
 *   R1: motion=true AND lux < 200 → ON
 *   R2: motion=true AND 200 <= lux < 500 → DIM:50
 *   R3: motion=true AND lux >= 500 → OFF (sufficient ambient light)
 *   R4: motion=false (sustained 5 min) → OFF
 *   R5: Night mode (22:00-06:00) → cap brightness at 30% (DIM:30)
 *
 * Debounce: 30 second minimum between state changes per room.
 */

const DEBOUNCE_MS = 30000; // 30 seconds
const MOTION_TIMEOUT_MS = 300000; // 5 minutes
const LUX_THRESHOLD_LOW = 200;
const LUX_THRESHOLD_HIGH = 500;
const NIGHT_START_HOUR = 22;
const NIGHT_END_HOUR = 6;

class RuleEvaluator {
  constructor(options = {}) {
    this.roomStates = new Map();
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.motionTimeoutMs = options.motionTimeoutMs ?? MOTION_TIMEOUT_MS;
    this.luxThresholdLow = options.luxThresholdLow ?? LUX_THRESHOLD_LOW;
    this.luxThresholdHigh = options.luxThresholdHigh ?? LUX_THRESHOLD_HIGH;
    this.nightStartHour = options.nightStartHour ?? NIGHT_START_HOUR;
    this.nightEndHour = options.nightEndHour ?? NIGHT_END_HOUR;
    this._nowFn = options.nowFn || (() => new Date());
  }

  _getRoomKey(buildingId, roomId) {
    return `${buildingId}:${roomId}`;
  }

  _getOrCreateRoom(buildingId, roomId) {
    const key = this._getRoomKey(buildingId, roomId);
    if (!this.roomStates.has(key)) {
      this.roomStates.set(key, {
        buildingId,
        roomId,
        motion: false,
        lastMotionTime: null,
        lux: null,
        currentLightState: 'OFF',
        currentBrightness: 0,
        lastStateChangeTime: null,
        luxBuffer: [] // sliding window for 5-min rolling average
      });
    }
    return this.roomStates.get(key);
  }

  updateMotion(buildingId, roomId, motion) {
    const room = this._getOrCreateRoom(buildingId, roomId);
    room.motion = motion;
    if (motion) {
      room.lastMotionTime = this._nowFn();
    }
  }

  updateLux(buildingId, roomId, lux) {
    const room = this._getOrCreateRoom(buildingId, roomId);
    room.lux = lux;

    // Maintain 5-minute sliding window for rolling average
    const now = this._nowFn();
    room.luxBuffer.push({ value: lux, timestamp: now });

    // Remove entries older than 5 minutes
    const cutoff = new Date(now.getTime() - 300000);
    room.luxBuffer = room.luxBuffer.filter((entry) => entry.timestamp >= cutoff);
  }

  getRollingAvgLux(buildingId, roomId) {
    const room = this._getOrCreateRoom(buildingId, roomId);
    if (room.luxBuffer.length === 0) return null;
    const sum = room.luxBuffer.reduce((acc, entry) => acc + entry.value, 0);
    return Math.round(sum / room.luxBuffer.length);
  }

  isNightMode(date) {
    const hour = date.getUTCHours();
    return hour >= this.nightStartHour || hour < this.nightEndHour;
  }

  isMotionTimedOut(room) {
    if (!room.lastMotionTime) return true;
    const now = this._nowFn();
    return now.getTime() - room.lastMotionTime.getTime() >= this.motionTimeoutMs;
  }

  isDebounceActive(room) {
    if (!room.lastStateChangeTime) return false;
    const now = this._nowFn();
    return now.getTime() - room.lastStateChangeTime.getTime() < this.debounceMs;
  }

  /**
   * Evaluate rules for a specific room.
   * Returns null if no action needed (state unchanged or debounced).
   * Returns { action, ruleId, reason, previousState } if actuation required.
   */
  evaluate(buildingId, roomId) {
    const room = this._getOrCreateRoom(buildingId, roomId);

    // Need at least one lux reading to make decisions
    if (room.lux === null) return null;

    const now = this._nowFn();
    const nightMode = this.isNightMode(now);

    let desiredAction = null;
    let ruleId = null;
    let reason = '';

    // R4: No motion for 5 minutes → OFF
    if (!room.motion && this.isMotionTimedOut(room)) {
      desiredAction = 'OFF';
      ruleId = 'R4';
      reason = 'No motion detected for 5 minutes';
    }
    // R3: Motion + high ambient light → OFF
    else if (room.motion && room.lux >= this.luxThresholdHigh) {
      desiredAction = 'OFF';
      ruleId = 'R3';
      reason = `Sufficient ambient light (${room.lux} lux >= ${this.luxThresholdHigh})`;
    }
    // R5: Night mode override → cap at DIM:30
    else if (room.motion && nightMode && room.lux < this.luxThresholdLow) {
      desiredAction = 'DIM:30';
      ruleId = 'R5';
      reason = `Night mode: motion + low light (${room.lux} lux), capped at 30%`;
    }
    // R1: Motion + low light → ON
    else if (room.motion && room.lux < this.luxThresholdLow) {
      desiredAction = 'ON';
      ruleId = 'R1';
      reason = `Motion detected + low light (${room.lux} lux < ${this.luxThresholdLow})`;
    }
    // R2: Motion + medium light → DIM:50
    else if (room.motion && room.lux >= this.luxThresholdLow && room.lux < this.luxThresholdHigh) {
      desiredAction = 'DIM:50';
      ruleId = 'R2';
      reason = `Motion detected + medium light (${room.lux} lux)`;
    }
    // No motion but within timeout → maintain current state
    else {
      return null;
    }

    // Check if action differs from current state
    if (desiredAction === room.currentLightState) {
      return null; // No change needed
    }

    // Debounce check
    if (this.isDebounceActive(room)) {
      return null; // Too soon since last change
    }

    // Apply state change
    const previousState = room.currentLightState;
    room.currentLightState = desiredAction;
    room.currentBrightness = this._actionToBrightness(desiredAction);
    room.lastStateChangeTime = now;

    return {
      action: desiredAction,
      ruleId,
      reason,
      previousState,
      buildingId,
      roomId,
      nightMode,
      lux: room.lux,
      motion: room.motion
    };
  }

  _actionToBrightness(action) {
    if (action === 'ON') return 100;
    if (action === 'OFF') return 0;
    if (action.startsWith('DIM:')) return parseInt(action.split(':')[1]);
    return 0;
  }

  getRoomState(buildingId, roomId) {
    const key = this._getRoomKey(buildingId, roomId);
    return this.roomStates.get(key) || null;
  }

  getAllRoomStates() {
    return Array.from(this.roomStates.values());
  }
}

module.exports = {
  RuleEvaluator,
  DEBOUNCE_MS,
  MOTION_TIMEOUT_MS,
  LUX_THRESHOLD_LOW,
  LUX_THRESHOLD_HIGH,
  NIGHT_START_HOUR,
  NIGHT_END_HOUR
};
