/**
 * Run All Simulators
 * Spawns PIR, LDR, and Light Actuator simulators as child processes.
 */

const { fork } = require('child_process');
const path = require('path');

console.log('=== Smart Home Lighting IoT — Sensor Simulator ===\n');

const children = [
  fork(path.join(__dirname, 'pir-sensor.js')),
  fork(path.join(__dirname, 'ldr-sensor.js')),
  fork(path.join(__dirname, 'light-actuator.js'))
];

process.on('SIGINT', () => {
  console.log('\n[Main] Stopping all simulators...');
  children.forEach((child) => child.kill('SIGINT'));
  setTimeout(() => process.exit(0), 2000);
});
