/**
 * NotificationHandler
 * Formats and delivers notifications via webhook.
 * Supports: actuation alerts, anomaly detection, system alerts.
 *
 * Threshold logic:
 *   - Rapid toggling: > 5 state changes in 2 minutes → anomaly alert
 *   - Device offline: device not seen for > 5 minutes → warning
 *   - Unusual lux: lux reading > 950 or < 5 during expected hours → anomaly
 */

const axios = require('axios');

class NotificationHandler {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl;
    this.sendFn = options.sendFn || null; // For testing injection
    this.actuationHistory = new Map(); // roomKey → [timestamps]
    this.RAPID_TOGGLE_THRESHOLD = 5;
    this.RAPID_TOGGLE_WINDOW_MS = 120000; // 2 minutes
    this.notificationLog = [];
  }

  /**
   * Format an actuation event into a notification payload.
   */
  formatActuationPayload(event) {
    return {
      type: 'actuation',
      severity: 'info',
      title: `Light ${event.command} — ${event.buildingId}/${event.roomId}`,
      message: `Light command ${event.command} triggered by rule ${event.ruleId || 'manual'}. Reason: ${event.reason || 'N/A'}`,
      data: {
        buildingId: event.buildingId,
        roomId: event.roomId,
        command: event.command,
        ruleId: event.ruleId,
        reason: event.reason
      },
      timestamp: event.timestamp || new Date().toISOString()
    };
  }

  /**
   * Format an anomaly event into a notification payload.
   */
  formatAnomalyPayload(event) {
    return {
      type: 'anomaly',
      severity: 'warning',
      title: `Anomaly detected — ${event.buildingId}/${event.roomId}`,
      message: event.description || `Anomaly detected in ${event.roomId}`,
      data: event,
      timestamp: event.timestamp || new Date().toISOString()
    };
  }

  /**
   * Format a system alert.
   */
  formatAlertPayload(event) {
    return {
      type: 'alert',
      severity: event.severity || 'warning',
      title: `System Alert: ${event.alertType}`,
      message: event.message || `Alert type: ${event.alertType}`,
      data: event,
      timestamp: event.timestamp || new Date().toISOString()
    };
  }

  /**
   * Check for rapid toggling anomaly.
   */
  checkRapidToggling(buildingId, roomId) {
    const key = `${buildingId}:${roomId}`;
    const now = Date.now();

    if (!this.actuationHistory.has(key)) {
      this.actuationHistory.set(key, []);
    }

    const history = this.actuationHistory.get(key);
    history.push(now);

    // Remove entries outside the window
    const cutoff = now - this.RAPID_TOGGLE_WINDOW_MS;
    const filtered = history.filter((t) => t >= cutoff);
    this.actuationHistory.set(key, filtered);

    return filtered.length > this.RAPID_TOGGLE_THRESHOLD;
  }

  /**
   * Validate lux reading for anomalies.
   * Returns anomaly description or null.
   */
  checkLuxAnomaly(lux, hour) {
    if (lux > 950) {
      return `Unusually high lux reading: ${lux} (sensor malfunction?)`;
    }
    // Nighttime (22:00-06:00) with high lux is suspicious
    if ((hour >= 22 || hour < 6) && lux > 400) {
      return `High lux during nighttime: ${lux} lux at hour ${hour}`;
    }
    // Daytime (10:00-15:00) with very low lux
    if (hour >= 10 && hour <= 15 && lux < 5) {
      return `Extremely low lux during daytime: ${lux} lux at hour ${hour}`;
    }
    return null;
  }

  /**
   * Send notification via webhook.
   */
  async send(payload) {
    this.notificationLog.push(payload);

    // Allow injection for testing
    if (this.sendFn) {
      return this.sendFn(payload);
    }

    if (!this.webhookUrl) {
      console.log('[Notification] No webhook URL configured, logging only');
      console.log('[Notification]', JSON.stringify(payload, null, 2));
      return { logged: true };
    }

    try {
      const response = await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      console.log(`[Notification] Webhook sent: ${payload.title} (${response.status})`);
      return { sent: true, status: response.status };
    } catch (err) {
      console.error(`[Notification] Webhook failed: ${err.message}`);
      return { sent: false, error: err.message };
    }
  }

  /**
   * Handle actuation event — send notification and check for rapid toggling.
   */
  async handleActuation(event) {
    const payload = this.formatActuationPayload(event);
    await this.send(payload);

    // Check for rapid toggling
    if (event.buildingId && event.roomId) {
      const isRapid = this.checkRapidToggling(event.buildingId, event.roomId);
      if (isRapid) {
        const anomalyPayload = this.formatAnomalyPayload({
          buildingId: event.buildingId,
          roomId: event.roomId,
          description: `Rapid toggling detected: >${this.RAPID_TOGGLE_THRESHOLD} state changes in ${this.RAPID_TOGGLE_WINDOW_MS / 1000}s`,
          severity: 'warning'
        });
        await this.send(anomalyPayload);
      }
    }
  }

  /**
   * Handle anomaly event.
   */
  async handleAnomaly(event) {
    const payload = this.formatAnomalyPayload(event);
    return this.send(payload);
  }

  /**
   * Handle system alert.
   */
  async handleAlert(event) {
    const payload = this.formatAlertPayload(event);
    return this.send(payload);
  }

  getLog() {
    return this.notificationLog;
  }
}

module.exports = { NotificationHandler };
