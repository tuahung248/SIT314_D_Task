/**
 * Notification Service Unit Tests
 * 14 tests covering: alert formatting, webhook payload, threshold logic
 */

const { NotificationHandler } = require('../src/notification-handler');

describe('NotificationHandler', () => {
  let handler;
  let sentPayloads;

  beforeEach(() => {
    sentPayloads = [];
    handler = new NotificationHandler({
      webhookUrl: 'https://webhook.site/test',
      sendFn: async (payload) => {
        sentPayloads.push(payload);
        return { sent: true, status: 200 };
      }
    });
  });

  // ============================================================
  // Alert Formatting
  // ============================================================
  describe('Alert Formatting', () => {
    test('should format actuation payload with correct type', () => {
      const payload = handler.formatActuationPayload({
        buildingId: 'b1',
        roomId: 'r1',
        command: 'ON',
        ruleId: 'R1',
        reason: 'Motion + low light'
      });

      expect(payload.type).toBe('actuation');
      expect(payload.severity).toBe('info');
      expect(payload.title).toContain('ON');
      expect(payload.title).toContain('b1/r1');
    });

    test('should format anomaly payload with warning severity', () => {
      const payload = handler.formatAnomalyPayload({
        buildingId: 'b1',
        roomId: 'r1',
        description: 'Rapid toggling detected'
      });

      expect(payload.type).toBe('anomaly');
      expect(payload.severity).toBe('warning');
      expect(payload.title).toContain('Anomaly');
    });

    test('should format system alert with custom severity', () => {
      const payload = handler.formatAlertPayload({
        alertType: 'device_offline',
        severity: 'critical',
        message: 'Device b01-r03-pir offline for 10 minutes'
      });

      expect(payload.type).toBe('alert');
      expect(payload.severity).toBe('critical');
      expect(payload.title).toContain('device_offline');
    });

    test('should include timestamp in all payloads', () => {
      const actuation = handler.formatActuationPayload({ command: 'ON', buildingId: 'b1', roomId: 'r1' });
      const anomaly = handler.formatAnomalyPayload({ buildingId: 'b1', roomId: 'r1' });
      const alert = handler.formatAlertPayload({ alertType: 'test' });

      expect(actuation.timestamp).toBeDefined();
      expect(anomaly.timestamp).toBeDefined();
      expect(alert.timestamp).toBeDefined();
    });

    test('should use provided timestamp when available', () => {
      const ts = '2026-09-15T10:00:00.000Z';
      const payload = handler.formatActuationPayload({
        command: 'OFF',
        buildingId: 'b1',
        roomId: 'r1',
        timestamp: ts
      });

      expect(payload.timestamp).toBe(ts);
    });
  });

  // ============================================================
  // Webhook Payload
  // ============================================================
  describe('Webhook Delivery', () => {
    test('should send actuation notification via webhook', async () => {
      await handler.handleActuation({
        buildingId: 'b1',
        roomId: 'r1',
        command: 'ON',
        ruleId: 'R1',
        reason: 'Motion detected'
      });

      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].type).toBe('actuation');
    });

    test('should send anomaly notification via webhook', async () => {
      await handler.handleAnomaly({
        buildingId: 'b1',
        roomId: 'r1',
        description: 'Sensor malfunction'
      });

      expect(sentPayloads.length).toBe(1);
      expect(sentPayloads[0].type).toBe('anomaly');
    });

    test('should log all sent notifications', async () => {
      await handler.handleActuation({ command: 'ON', buildingId: 'b1', roomId: 'r1' });
      await handler.handleAlert({ alertType: 'test' });

      const log = handler.getLog();
      expect(log.length).toBe(2);
    });

    test('should include command data in actuation payload', async () => {
      await handler.handleActuation({
        buildingId: 'b1',
        roomId: 'r1',
        command: 'DIM:50',
        ruleId: 'R2',
        reason: 'Medium light'
      });

      expect(sentPayloads[0].data.command).toBe('DIM:50');
      expect(sentPayloads[0].data.ruleId).toBe('R2');
    });
  });

  // ============================================================
  // Threshold Logic — Rapid Toggling
  // ============================================================
  describe('Rapid Toggling Detection', () => {
    test('should NOT trigger for fewer than 5 changes', () => {
      for (let i = 0; i < 4; i++) {
        const result = handler.checkRapidToggling('b1', 'r1');
        expect(result).toBe(false);
      }
    });

    test('should trigger after 6 changes within 2 minutes', () => {
      for (let i = 0; i < 6; i++) {
        handler.checkRapidToggling('b1', 'r1');
      }
      const result = handler.checkRapidToggling('b1', 'r1');
      expect(result).toBe(true);
    });

    test('should send anomaly notification on rapid toggling', async () => {
      // Trigger rapid toggling
      for (let i = 0; i < 6; i++) {
        handler.checkRapidToggling('b1', 'r1');
      }

      await handler.handleActuation({
        buildingId: 'b1',
        roomId: 'r1',
        command: 'ON',
        ruleId: 'R1'
      });

      // Should have actuation + anomaly
      expect(sentPayloads.length).toBe(2);
      expect(sentPayloads[1].type).toBe('anomaly');
      expect(sentPayloads[1].title).toContain('Anomaly');
    });

    test('rapid toggling should be per-room', () => {
      for (let i = 0; i < 6; i++) {
        handler.checkRapidToggling('b1', 'r1');
      }

      // Room 2 should not be affected
      const result = handler.checkRapidToggling('b1', 'r2');
      expect(result).toBe(false);
    });
  });

  // ============================================================
  // Lux Anomaly Detection
  // ============================================================
  describe('Lux Anomaly Detection', () => {
    test('should detect unusually high lux (>950)', () => {
      const result = handler.checkLuxAnomaly(960, 12);
      expect(result).toContain('Unusually high');
    });

    test('should detect high lux during nighttime', () => {
      const result = handler.checkLuxAnomaly(500, 23);
      expect(result).toContain('nighttime');
    });

    test('should detect extremely low lux during daytime', () => {
      const result = handler.checkLuxAnomaly(2, 12);
      expect(result).toContain('low lux');
    });

    test('should return null for normal readings', () => {
      const result = handler.checkLuxAnomaly(400, 12);
      expect(result).toBeNull();
    });
  });
});
