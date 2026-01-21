# RabbitMQ Demo (Sections 4/5/6/7 - Practical + Best Practices + Real World)

This repository contains an interactive RabbitMQ demo aligned with the seminar paper sections **4, 5, 6, 7**:

- Practical setup + Management UI (section 4)
- Best practices: manual ACK, QoS prefetch, durable/persistent, retry + DLQ, separate publish/consume connections (section 5)
- Real-world scenarios: e-commerce pipeline with multiple services (section 7)
- Notes on comparisons (section 6) are reflected in the scenario descriptions (offline consumers, message persistence)

It includes:
- `standalone/consumer.js` - interactive consumer: select a scenario + role
- `standalone/producer.js` - interactive producer: select a scenario, prints what it represents + which consumers to run

Multi-terminal run: start one or more `npm run consumer` terminals, then use `npm run producer`.

---

## Prerequisites

Make sure you have the following installed:
- **Node.js** (v14 or higher)
- **Docker** and **Docker Compose**
- **npm** (comes with Node.js)

## Quick Start

### 1. Install Dependencies

```bash
cd rabbitmq-demo
npm install
```

### 2. Start RabbitMQ

```bash
npm run docker:up
```

Wait 10-15 seconds for RabbitMQ to be ready.

### 3. Run consumer and producer (multiple terminals)

Terminal 1:

```bash
npm run consumer
```

Terminal 2:

```bash
npm run producer
```

Optional: start more consumers (different roles/patterns) depending on the selected use case.

### 4. Auto-launch workflows (opens required terminals)

Each workflow has its own JS entry point and can auto-start the producer + required consumers.
Example (fanout workflow = 1 producer + 3 consumers):

```bash
npm run workflow:fanout
```

Available workflow scripts:

```bash
npm run workflow:direct
npm run workflow:fanout
npm run workflow:topic
npm run workflow:work-queue
npm run workflow:reliable
npm run workflow:ecommerce
```

These scripts:
- Open terminal windows for each required producer/consumer.
- Start the demo automatically (producer runs in demo mode).
- Arrange windows in a grid layout (best-effort based on OS/terminal support).

## RabbitMQ Management UI

After starting RabbitMQ, you can access the management interface:

- **URL**: http://localhost:15672
- **Username**: `user`
- **Password**: `root`

The UI allows you to:
- Monitor queues, exchanges, and connections in real-time
- See message rates and statistics
- Manually publish test messages
- Visualize message flow

## Project Structure

```
rabbitmq-demo/
├── package.json                # Dependencies and scripts
├── docker-compose.yml          # RabbitMQ container configuration
├── utils/
│   └── connection.js           # RabbitMQ connection helper
├── standalone/
│   ├── producer.js             # Interactive producer (all scenarios)
│   ├── consumer.js             # Interactive consumer (all scenarios)
│   ├── workflowLauncher.js     # Opens terminal windows for auto demos
│   ├── cliArgs.js              # CLI parsing helpers
│   ├── rabbitConstants.js      # Exchange/queue names
│   ├── useCases.js             # Use case definitions
│   └── helpers.js              # Small utilities
├── workflows/                  # Auto-launch scripts per workflow
│   ├── direct_logs.js
│   ├── fanout_notifications.js
│   ├── topic_events.js
│   ├── work_queue.js
│   ├── reliable_tasks.js
│   └── ecommerce_pipeline.js
```

## Docker Commands (Manual)

If you prefer to manage RabbitMQ manually:

```bash
# Start RabbitMQ
docker compose up -d

# View logs
docker compose logs -f rabbitmq

# Stop RabbitMQ
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## npm Scripts

```bash
npm start              # Start the producer (interactive scenarios)
npm run producer       # Start the producer (interactive scenarios)
npm run consumer       # Start the consumer (interactive scenarios)
npm run workflow:direct  # Auto-launch direct logs workflow
npm run workflow:fanout  # Auto-launch fanout workflow
npm run workflow:topic   # Auto-launch topic workflow
npm run workflow:work-queue # Auto-launch work queue workflow
npm run workflow:reliable # Auto-launch reliable tasks workflow
npm run workflow:ecommerce # Auto-launch e-commerce workflow
npm run docker:up      # Start RabbitMQ
npm run docker:down    # Stop RabbitMQ
npm run docker:logs    # View RabbitMQ logs
```

## Key Concepts Demonstrated

### From the Term Paper

1. **Asynchronous Communication** (Chapter 2.1)
   - Producers don't wait for consumers
   - Messages processed independently

2. **Loose Coupling** (Chapter 2.1)
   - Producers and consumers don't know about each other
   - Message broker handles routing

3. **AMQP Components** (Chapter 3.1)
   - Producer → Exchange → Queue → Consumer
   - Bindings define routing rules

4. **Reliability** (Chapter 5)
   - Message acknowledgments
   - Durable queues and persistent messages
   - Prefetch limits for fair distribution

## Troubleshooting

### RabbitMQ won't start
```bash
# Check if port 5672 or 15672 is already in use
docker ps -a
docker compose down -v  # Clean slate
docker compose up -d
```

### Connection errors
- Make sure RabbitMQ is running: `docker ps`
- Check RabbitMQ logs: `npm run docker:logs`
- Wait 10-15 seconds after starting for RabbitMQ to be fully ready

### Demos not appearing
- Ensure RabbitMQ is running (green checkmark in menu)
- Select "Start RabbitMQ" from the menu first

## License

MIT - Created for educational purposes as part of a term paper on Event-Driven Architecture.
