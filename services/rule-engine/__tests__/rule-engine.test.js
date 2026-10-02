/**
 * Rule Engine Unit Tests
 * 42 tests covering: condition evaluation, debounce, time-of-day edge cases
 */

const { RuleEvaluator } = require('../src/rule-evaluator');

describe('RuleEvaluator', () => {
  let evaluator;
  let mockNow;

  beforeEach(() => {
    // Default: daytime, 10:00 AM
    mockNow = new Date('2026-09-15T10:00:00.000Z');
    evaluator = new RuleEvaluator({
      debounceMs: 30000,
      motionTimeoutMs: 300000,
      nowFn: () => mockNow
    });
  });

  // ============================================================
  // R1: motion=true AND lux < 200 → ON
  // ============================================================
  describe('R1 — Motion + Low Light → ON', () => {
    test('should turn light ON when motion=true and lux=50', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 50);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).not.toBeNull();
      expect(result.action).toBe('ON');
      expect(result.ruleId).toBe('R1');
    });

    test('should turn light ON when motion=true and lux=0', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 0);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('ON');
    });

    test('should turn light ON when motion=true and lux=199', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 199);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('ON');
      expect(result.ruleId).toBe('R1');
    });

    test('should NOT turn ON when lux=200 (boundary → DIM instead)', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 200);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:50');
      expect(result.ruleId).toBe('R2');
    });
  });

  // ============================================================
  // R2: motion=true AND 200 <= lux < 500 → DIM:50
  // ============================================================
  describe('R2 — Motion + Medium Light → DIM:50', () => {
    test('should DIM:50 when motion=true and lux=200', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 200);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:50');
      expect(result.ruleId).toBe('R2');
    });

    test('should DIM:50 when motion=true and lux=350', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 350);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:50');
    });

    test('should DIM:50 when motion=true and lux=499', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 499);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:50');
    });

    test('should NOT DIM when lux=500 (boundary → OFF instead)', () => {
      // First put room into ON state (motion + low lux)
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // → ON

      // Advance past debounce
      mockNow = new Date(mockNow.getTime() + 31000);

      // Now test boundary: lux=500 should trigger R3 (OFF)
      evaluator.updateLux('b1', 'r1', 500);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
      expect(result.ruleId).toBe('R3');
    });
  });

  // ============================================================
  // R3: motion=true AND lux >= 500 → OFF
  // ============================================================
  describe('R3 — Motion + High Ambient Light → OFF', () => {
    test('should turn OFF when motion=true and lux=500', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 500);
      const result = evaluator.evaluate('b1', 'r1');
      // Light starts as OFF, so no action needed
      expect(result).toBeNull(); // already OFF
    });

    test('should turn OFF when light is ON and lux rises to 600', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // turns ON

      // Wait past debounce
      mockNow = new Date(mockNow.getTime() + 31000);
      evaluator.updateLux('b1', 'r1', 600);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
      expect(result.ruleId).toBe('R3');
    });

    test('should turn OFF when lux=1000 (max)', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // ON

      mockNow = new Date(mockNow.getTime() + 31000);
      evaluator.updateLux('b1', 'r1', 1000);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
    });
  });

  // ============================================================
  // R4: No motion for 5 minutes → OFF
  // ============================================================
  describe('R4 — Motion Timeout → OFF', () => {
    test('should turn OFF after 5 minutes with no motion', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // ON

      // Advance 5+ minutes, motion=false
      mockNow = new Date(mockNow.getTime() + 310000);
      evaluator.updateMotion('b1', 'r1', false);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
      expect(result.ruleId).toBe('R4');
    });

    test('should NOT turn OFF at 4 minutes 59 seconds', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // ON

      // Advance 4m59s
      mockNow = new Date(mockNow.getTime() + 299000);
      evaluator.updateMotion('b1', 'r1', false);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).toBeNull(); // Maintain current state
    });

    test('should turn OFF exactly at 5 minutes', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1');

      mockNow = new Date(mockNow.getTime() + 300000);
      evaluator.updateMotion('b1', 'r1', false);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
    });

    test('should reset timeout when new motion detected', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // ON

      // 4 minutes pass
      mockNow = new Date(mockNow.getTime() + 240000);
      evaluator.updateMotion('b1', 'r1', true); // New motion resets timer

      // 4 more minutes (total 8, but only 4 since last motion)
      mockNow = new Date(mockNow.getTime() + 240000);
      evaluator.updateMotion('b1', 'r1', false);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).toBeNull(); // Not yet timed out from last motion
    });
  });

  // ============================================================
  // R5: Night mode (22:00-06:00) → DIM:30 cap
  // ============================================================
  describe('R5 — Night Mode', () => {
    test('should cap at DIM:30 at 23:00 with motion + low light', () => {
      mockNow = new Date('2026-09-15T23:00:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 50);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:30');
      expect(result.ruleId).toBe('R5');
    });

    test('should cap at DIM:30 at 03:00 (deep night)', () => {
      mockNow = new Date('2026-09-15T03:00:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 10);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:30');
      expect(result.ruleId).toBe('R5');
    });

    test('should use ON (not night cap) at 06:00 exactly (daytime starts)', () => {
      mockNow = new Date('2026-09-15T06:00:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 50);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('ON');
      expect(result.ruleId).toBe('R1');
    });

    test('should use night mode at 22:00 exactly', () => {
      mockNow = new Date('2026-09-15T22:00:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('DIM:30');
      expect(result.ruleId).toBe('R5');
    });

    test('should NOT apply night mode at 21:59', () => {
      mockNow = new Date('2026-09-15T21:59:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 50);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('ON');
      expect(result.ruleId).toBe('R1');
    });

    test('should apply DIM:50 during night mode when lux is medium', () => {
      mockNow = new Date('2026-09-15T23:30:00.000Z');
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 300);
      const result = evaluator.evaluate('b1', 'r1');
      // Lux >= 200, so R2 applies (DIM:50), not R5
      expect(result.action).toBe('DIM:50');
      expect(result.ruleId).toBe('R2');
    });
  });

  // ============================================================
  // Debounce Logic
  // ============================================================
  describe('Debounce — 30 second minimum', () => {
    test('should block second state change within 30 seconds', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      const first = evaluator.evaluate('b1', 'r1');
      expect(first.action).toBe('ON');

      // Try to change 10 seconds later
      mockNow = new Date(mockNow.getTime() + 10000);
      evaluator.updateLux('b1', 'r1', 600);
      const second = evaluator.evaluate('b1', 'r1');
      expect(second).toBeNull(); // Debounced
    });

    test('should allow state change after 30 seconds', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // ON

      // 31 seconds later
      mockNow = new Date(mockNow.getTime() + 31000);
      evaluator.updateLux('b1', 'r1', 600);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.action).toBe('OFF');
    });

    test('should block at exactly 29 seconds', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1');

      mockNow = new Date(mockNow.getTime() + 29000);
      evaluator.updateLux('b1', 'r1', 600);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).toBeNull();
    });

    test('should allow at exactly 30 seconds', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1');

      mockNow = new Date(mockNow.getTime() + 30000);
      evaluator.updateLux('b1', 'r1', 600);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).not.toBeNull();
    });

    test('debounce should be per-room independent', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1'); // Room 1 ON

      // Room 2 should not be affected
      evaluator.updateMotion('b1', 'r2', true);
      evaluator.updateLux('b1', 'r2', 100);
      const result = evaluator.evaluate('b1', 'r2');
      expect(result.action).toBe('ON'); // Not debounced
    });
  });

  // ============================================================
  // State Tracking
  // ============================================================
  describe('State Tracking', () => {
    test('should return null when desired state matches current state', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      const first = evaluator.evaluate('b1', 'r1');
      expect(first.action).toBe('ON');

      // Same conditions, past debounce
      mockNow = new Date(mockNow.getTime() + 31000);
      evaluator.updateLux('b1', 'r1', 100);
      const second = evaluator.evaluate('b1', 'r1');
      expect(second).toBeNull(); // Already ON
    });

    test('should include previousState in result', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result.previousState).toBe('OFF'); // Initial state
    });

    test('should track state transitions correctly', () => {
      // OFF → ON
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      const r1 = evaluator.evaluate('b1', 'r1');
      expect(r1.previousState).toBe('OFF');
      expect(r1.action).toBe('ON');

      // ON → OFF (after debounce)
      mockNow = new Date(mockNow.getTime() + 31000);
      evaluator.updateLux('b1', 'r1', 700);
      const r2 = evaluator.evaluate('b1', 'r1');
      expect(r2.previousState).toBe('ON');
      expect(r2.action).toBe('OFF');
    });

    test('should return null when no lux data available', () => {
      evaluator.updateMotion('b1', 'r1', true);
      const result = evaluator.evaluate('b1', 'r1');
      expect(result).toBeNull();
    });
  });

  // ============================================================
  // Rolling Average
  // ============================================================
  describe('Rolling Average Lux', () => {
    test('should compute rolling average from multiple readings', () => {
      evaluator.updateLux('b1', 'r1', 100);
      mockNow = new Date(mockNow.getTime() + 1000);
      evaluator.updateLux('b1', 'r1', 200);
      mockNow = new Date(mockNow.getTime() + 1000);
      evaluator.updateLux('b1', 'r1', 300);

      const avg = evaluator.getRollingAvgLux('b1', 'r1');
      expect(avg).toBe(200);
    });

    test('should expire old entries from sliding window', () => {
      evaluator.updateLux('b1', 'r1', 1000);

      // Advance past 5 minutes
      mockNow = new Date(mockNow.getTime() + 310000);
      evaluator.updateLux('b1', 'r1', 200);

      const avg = evaluator.getRollingAvgLux('b1', 'r1');
      expect(avg).toBe(200); // Old 1000 reading dropped
    });

    test('should return null for room with no lux data', () => {
      const avg = evaluator.getRollingAvgLux('b1', 'r1');
      expect(avg).toBeNull();
    });
  });

  // ============================================================
  // Multi-Room Independence
  // ============================================================
  describe('Multi-Room Independence', () => {
    test('room states should be independent', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.evaluate('b1', 'r1');

      evaluator.updateMotion('b1', 'r2', false);
      evaluator.updateLux('b1', 'r2', 800);

      const state1 = evaluator.getRoomState('b1', 'r1');
      const state2 = evaluator.getRoomState('b1', 'r2');

      expect(state1.currentLightState).toBe('ON');
      expect(state2.currentLightState).toBe('OFF');
    });

    test('multi-building room isolation', () => {
      evaluator.updateMotion('b1', 'r1', true);
      evaluator.updateLux('b1', 'r1', 50);
      evaluator.evaluate('b1', 'r1');

      evaluator.updateMotion('b2', 'r1', true);
      evaluator.updateLux('b2', 'r1', 300);
      evaluator.evaluate('b2', 'r1');

      const b1r1 = evaluator.getRoomState('b1', 'r1');
      const b2r1 = evaluator.getRoomState('b2', 'r1');

      expect(b1r1.currentLightState).toBe('ON');
      expect(b2r1.currentLightState).toBe('DIM:50');
    });

    test('getAllRoomStates returns all rooms', () => {
      evaluator.updateLux('b1', 'r1', 100);
      evaluator.updateLux('b1', 'r2', 200);
      evaluator.updateLux('b2', 'r1', 300);

      const states = evaluator.getAllRoomStates();
      expect(states.length).toBe(3);
    });
  });

  // ============================================================
  // Night Mode Helper
  // ============================================================
  describe('isNightMode helper', () => {
    test('22:00 is night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T22:00:00Z'))).toBe(true);
    });

    test('23:59 is night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T23:59:00Z'))).toBe(true);
    });

    test('00:00 is night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T00:00:00Z'))).toBe(true);
    });

    test('05:59 is night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T05:59:00Z'))).toBe(true);
    });

    test('06:00 is NOT night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T06:00:00Z'))).toBe(false);
    });

    test('12:00 is NOT night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T12:00:00Z'))).toBe(false);
    });

    test('21:59 is NOT night mode', () => {
      expect(evaluator.isNightMode(new Date('2026-09-15T21:59:00Z'))).toBe(false);
    });
  });
});
