# Smart Home Lighting IoT System

**SIT314 — Task 6.3D (Distinction)**  
Student: Tuan Hung Bui (223837827)

## Overview

An IoT-based smart lighting system that automates building lighting using PIR motion and LDR ambient light sensors. The system uses a microservices architecture with MQTT messaging, MongoDB storage, and Docker containerisation. Designed to scale from 10 to 1,000+ devices via AWS ECS Fargate with SQS-based competitive consumers.

## Architecture

```
┌─────────────┐     MQTT      ┌──────────────┐     MQTT      ┌─────────────────┐
│  Simulators  │──────────────▶│  Mosquitto   │──────────────▶│  Rule Engine     │
│  PIR + LDR   │              │  Broker      │◀──────────────│  (5 rules)       │
│  + Actuator  │◀─────────────│  (1883/9001) │              │                   │
└─────────────┘   light/cmd   └──────┬───────┘              └────────┬──────────┘
                                     │                               │
                               ┌─────▼───────┐              ┌───────▼──────────┐
                               │  Node-RED    │              │  MongoDB         │
                               │  (Flows +    │              │  (sensor_data +  │
                               │   Dashboard) │              │   actuation_log) │
                               └─────────────┘              └──────────────────┘
                                                                     │
                               ┌─────────────┐              ┌───────▼──────────┐
                               │ Notification │◀─────────────│  Device Service  │
                               │ Service      │   MQTT       │  (REST API)      │
                               │ (Webhook)    │              │  :3001           │
                               └─────────────┘              └──────────────────┘
```

### Microservices

| Service | Port | Role |
|---|---|---|
| **Rule Engine** | — | Evaluates 5 lighting rules (R1–R5), publishes light commands |
| **Device Service** | 3001 | REST API for device registry + sensor readings |
| **Notification Service** | — | Sends webhook alerts for actuations and anomalies |

### Lighting Rules

| Rule | Condition | Action |
|---|---|---|
| R1 | Motion detected AND lux < 200 | Light ON |
| R2 | Motion detected AND 200 ≤ lux < 500 | Light DIM 50% |
| R3 | Motion detected AND lux ≥ 500 | Light OFF |
| R4 | No motion for 5 minutes | Light OFF |
| R5 | Night mode (22:00–06:00) | Cap brightness at 30% |

## Prerequisites

- **Node.js** 18+ and npm
- **Docker** and Docker Compose
- **MongoDB** (via Docker or MongoDB Atlas free tier)
- **Git**

## Quick Start

### 1. Clone and install dependencies

```bash
cd 6.3D
npm install
cd simulators && npm install && cd ..
cd services/rule-engine && npm install && cd ../..
cd services/device-service && npm install && cd ../..
cd services/notification-service && npm install && cd ../..
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and webhook URL
```

### 3. Start infrastructure (Docker)

```bash
docker-compose up -d mosquitto mongodb node-red
```

### 4. Start microservices

```bash
# Terminal 1: Rule Engine
cd services/rule-engine && node src/index.js

# Terminal 2: Device Service
cd services/device-service && node src/index.js

# Terminal 3: Notification Service
cd services/notification-service && node src/index.js
```

### 5. Start simulators

```bash
# Terminal 4: All simulators
node simulators/run-all.js
```

### 6. View Node-RED Dashboard

Open http://localhost:1880/ui in your browser.

## Testing

### Unit Tests (74 tests)

```bash
# All tests
npm test

# Individual services
cd services/rule-engine && npx jest --verbose
cd services/device-service && npx jest --verbose
cd services/notification-service && npx jest --verbose
```

### Integration Test

```bash
# 10-device scale (1 minute)
node scripts/integration-test.js 10

# 100-device scale (5 minutes)
node scripts/integration-test.js 100

# 1000-device scale (10 minutes)
node scripts/integration-test.js 1000
```

### Load / Scaling Test

```bash
node scripts/load-test.js
# Ramps 100 → 1000 devices over 10 minutes
```

## AWS Deployment (Production)

The `infrastructure/` folder contains:

- `ecs-task-definition.json` — Fargate task definition for Rule Engine
- `scaling-policy.json` — Auto-scaling: SQS backlog-per-task + CPU utilisation
- `iot-policy.json` — Per-device IoT Core policy (least-privilege)

## Project Structure

```
6.3D/
├── simulators/             # Simulated IoT devices
│   ├── pir-sensor.js       # PIR motion sensor simulator
│   ├── ldr-sensor.js       # LDR ambient light sensor
│   ├── light-actuator.js   # Light actuator (command receiver)
│   └── run-all.js          # Launch all simulators
├── services/
│   ├── rule-engine/        # Core business logic (5 rules)
│   ├── device-service/     # REST API + device registry
│   └── notification-service/ # Webhook notifications
├── node-red/
│   └── flows.json          # 3 Node-RED flows
├── infrastructure/         # AWS ECS, scaling, IoT policies
├── scripts/
│   ├── integration-test.js # End-to-end latency measurement
│   └── load-test.js        # Scaling test (100→1000 devices)
├── docker-compose.yml      # Local development stack
└── package.json            # Root project scripts
```

## Technology Stack

- **Runtime:** Node.js 20 (Alpine)
- **Messaging:** MQTT (Eclipse Mosquitto 2.x)
- **Database:** MongoDB 7 (time-series collections)
- **Orchestration:** Node-RED 3.x
- **Containerisation:** Docker + Docker Compose
- **Cloud:** AWS ECS Fargate, SQS, IoT Core
- **Testing:** Jest, custom integration harness
