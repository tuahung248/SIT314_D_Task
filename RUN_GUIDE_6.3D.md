# SIT314 Task 6.3D — Step-by-Step Run Guide & Screenshot Locations

**Student:** Tuan Hung Bui (223837827)

---

## Prerequisites (Install These First)

1. **Node.js 18+** — https://nodejs.org (download LTS)
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop
3. **MongoDB Atlas** (free tier) — https://www.mongodb.com/atlas
4. **Webhook.site** — https://webhook.site (open in browser, copy your unique URL)

---

## PHASE 1: Setup & Configuration

### Step 1: Open Terminal and navigate to project

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
```

### Step 2: Install all dependencies

```bash
npm install
cd simulators && npm install && cd ..
cd services/rule-engine && npm install && cd ../..
cd services/device-service && npm install && cd ../..
cd services/notification-service && npm install && cd ../..
```

### Step 3: Create .env file

```bash
cp .env.example .env
```

Then edit `.env` with your actual values:

```
MQTT_BROKER_URL=mqtt://localhost:1883
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/smart_home?retryWrites=true&w=majority
WEBHOOK_URL=https://webhook.site/<your-unique-id>
AWS_REGION=ap-southeast-2
SQS_QUEUE_URL=
```

**MongoDB Atlas setup:**
1. Go to https://cloud.mongodb.com
2. Create free cluster (M0 Sandbox)
3. Create database user (username + password)
4. Network Access → Add IP → "Allow Access from Anywhere" (0.0.0.0/0)
5. Connect → Drivers → Copy connection string → Paste into MONGODB_URI replacing `<password>`

> **SCREENSHOT 1: MongoDB Atlas cluster dashboard** showing your cluster name and "M0 Sandbox" tier

---

## PHASE 2: Start Infrastructure

### Step 4: Start Docker containers

Make sure Docker Desktop is running, then:

```bash
docker-compose up -d mosquitto mongodb node-red
```

You should see:
```
Creating mosquitto ... done
Creating mongodb   ... done
Creating node-red  ... done
```

Verify they're running:
```bash
docker-compose ps
```

> **SCREENSHOT 2: Terminal showing `docker-compose ps`** with all 3 containers in "Up" state

### Step 5: Import Node-RED flows

1. Open browser → http://localhost:1880
2. Click hamburger menu (top-right ☰) → Import
3. Click "select a file to import"
4. Navigate to `6.3D/node-red/flows.json`
5. Click Import → Deploy (top-right red button)

> **SCREENSHOT 3: Node-RED editor** showing the 3 imported flows (Ingest, Rule Engine Proxy, Dashboard tabs)

---

## PHASE 3: Run Microservices

Open **4 separate Terminal windows/tabs** for this phase.

### Step 6: Terminal 1 — Rule Engine

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
cd services/rule-engine
node src/index.js
```

You should see:
```
Rule Engine started
Connected to MongoDB
Connected to MQTT broker
```

### Step 7: Terminal 2 — Device Service

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
cd services/device-service
node src/index.js
```

You should see:
```
Device Service running on port 3001
Connected to MongoDB
Connected to MQTT broker
```

### Step 8: Terminal 3 — Notification Service

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
cd services/notification-service
node src/index.js
```

You should see:
```
Notification Service started
Connected to MQTT broker
```

### Step 9: Terminal 4 — Simulators

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
node simulators/run-all.js
```

You should see sensor data flowing:
```
[PIR] building_01/room_01 motion=true
[LDR] building_01/room_01 lux=342
[ACTUATOR] building_01/room_01 → ON (lux=342, motion=true)
```

> **SCREENSHOT 4: All 4 terminal windows visible** showing each service running with live output

> **SCREENSHOT 5: Terminal showing simulator output** with sensor readings and actuation commands flowing

---

## PHASE 4: Verify System Working

### Step 10: Check Device Service REST API

Open browser → http://localhost:3001/api/devices

You should see JSON listing registered devices.

> **SCREENSHOT 6: Browser showing `/api/devices`** JSON response with device objects

Open → http://localhost:3001/api/stats

> **SCREENSHOT 7: Browser showing `/api/stats`** with device counts (online/offline/total)

### Step 11: Check Node-RED Dashboard

Open browser → http://localhost:1880/ui

You should see:
- Motion detection indicators
- Lux readings chart
- Light command history

> **SCREENSHOT 8: Node-RED dashboard** showing live sensor data and charts

### Step 12: Check Webhook Notifications

Open your Webhook.site URL in browser.

You should see POST requests arriving with JSON payloads containing actuation events.

> **SCREENSHOT 9: Webhook.site showing received notifications** with actuation payloads (ON/OFF/DIM commands)

---

## PHASE 5: Run Unit Tests

### Step 13: Run all 74 unit tests

Open a **new Terminal** (keep the services running):

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
npm test
```

This runs Jest tests across all 3 services. Expected output:
```
Rule Engine Tests
  ✓ R1: motion + low lux → ON
  ✓ R2: motion + medium lux → DIM:50
  ... (42 tests)

Device Service Tests
  ✓ registers new device
  ... (18 tests)

Notification Service Tests
  ✓ formats actuation alert
  ... (14 tests)

Test Suites: 3 passed, 3 total
Tests:       74 passed, 74 total
```

> **SCREENSHOT 10: Terminal showing `npm test` output** with all 74 tests passing (green)

For verbose output per service:
```bash
cd services/rule-engine && npx jest --verbose && cd ../..
```

> **SCREENSHOT 11: Verbose test output for Rule Engine** showing all 42 test names with ✓

---

## PHASE 6: Integration & Scale Testing

### Step 14: Integration test — 10 devices

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
node scripts/integration-test.js 10
```

Wait ~60 seconds. Expected output:
```
=== Results ===
Messages published: ~1200
Commands received:  ~...
Latency (ms):
  p50:  XXms
  p95:  XXms  ✅ PASS (<500ms)
  p99:  XXms
Test: 10 devices — PASSED
```

> **SCREENSHOT 12: Integration test results for 10 devices** showing p95 latency and PASS/FAIL

### Step 15: Integration test — 100 devices

```bash
node scripts/integration-test.js 100
```

Wait ~5 minutes.

> **SCREENSHOT 13: Integration test results for 100 devices** showing p95 latency

### Step 16: Load / Scaling test

```bash
node scripts/load-test.js
```

Wait ~10 minutes (ramps 100→1000 devices).

> **SCREENSHOT 14: Load test output** showing step progression and message rates per step

> **SCREENSHOT 15: Load test completion** showing total messages published and peak device count

---

## PHASE 7: Docker Full Stack (All Services Containerised)

### Step 17: Stop individual services (Ctrl+C in each terminal)

Then build and run everything via Docker:

```bash
cd "/Users/tuanhung/Documents/Deakin Uni/Third_Year_2026/Tri2_2026/SIT314_Software Architecture and Scalability for Internet-Of-Things/Submit/technical/6.3D"
docker-compose up -d --build
```

Verify:
```bash
docker-compose ps
```

> **SCREENSHOT 16: `docker-compose ps` showing all 6 services** running (mosquitto, mongodb, node-red, rule-engine, device-service, notification-service)

Check Docker Desktop for container view:

> **SCREENSHOT 17: Docker Desktop showing running containers** with resource usage

---

## PHASE 8: AWS Architecture Evidence (Documentation Screenshots)

These screenshots come from your AWS console or from your architecture documentation.

### Step 18: AWS IoT Core policy

Open `infrastructure/iot-policy.json` in VS Code or text editor.

> **SCREENSHOT 18: IoT policy JSON** showing per-device least-privilege access (publish own topics, deny others)

### Step 19: ECS Task Definition

Open `infrastructure/ecs-task-definition.json`.

> **SCREENSHOT 19: ECS task definition** showing Fargate config (256 CPU, 512 MB, container definition)

### Step 20: Auto-scaling policy

Open `infrastructure/scaling-policy.json`.

> **SCREENSHOT 20: Scaling policy** showing SQS backlog-per-task (target 100) and CPU utilisation (target 60%) policies

---

## Screenshot Checklist Summary

| # | What to Screenshot | Phase |
|---|---|---|
| 1 | MongoDB Atlas cluster dashboard | Setup |
| 2 | `docker-compose ps` — 3 infra containers running | Infrastructure |
| 3 | Node-RED editor with 3 imported flows | Infrastructure |
| 4 | All 4 terminal windows running services | Microservices |
| 5 | Simulator output — sensor data flowing | Microservices |
| 6 | Browser: `/api/devices` JSON response | Verification |
| 7 | Browser: `/api/stats` device counts | Verification |
| 8 | Node-RED dashboard with live charts | Verification |
| 9 | Webhook.site — received notifications | Verification |
| 10 | `npm test` — 74 tests passing | Unit Tests |
| 11 | Verbose Jest output for Rule Engine (42 tests) | Unit Tests |
| 12 | Integration test — 10 devices result | Scale Testing |
| 13 | Integration test — 100 devices result | Scale Testing |
| 14 | Load test — step progression | Scale Testing |
| 15 | Load test — completion summary | Scale Testing |
| 16 | `docker-compose ps` — all 6 services | Docker |
| 17 | Docker Desktop — container view | Docker |
| 18 | IoT policy JSON — least-privilege | AWS Architecture |
| 19 | ECS task definition — Fargate config | AWS Architecture |
| 20 | Scaling policy — SQS + CPU auto-scaling | AWS Architecture |

---

## Troubleshooting

**"Cannot connect to MQTT broker"**
→ Check Docker is running: `docker-compose ps` — mosquitto should be "Up"

**"MongoDB connection failed"**
→ Check your `.env` MONGODB_URI. Atlas → Network Access → make sure 0.0.0.0/0 is added.

**"Port 3001 already in use"**
→ Kill existing process: `lsof -ti:3001 | xargs kill -9`

**Unit tests fail with "Cannot find module"**
→ Run `npm install` inside the specific service directory

**Node-RED shows empty editor**
→ Re-import `node-red/flows.json` via Menu → Import → Deploy

---

## Stopping Everything

```bash
# Stop Docker containers
docker-compose down

# Stop individual services: Ctrl+C in each terminal
```
