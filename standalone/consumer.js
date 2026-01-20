#!/usr/bin/env node

const inquirer = require('inquirer');
const chalk = require('chalk');
const readline = require('readline');
const { createConnection, waitForConnection } = require('../utils/connection');
const { USE_CASES } = require('./useCases');
const C = require('./rabbitConstants');
const { sleep, clearScreen, printUseCaseIntro } = require('./helpers');

clearScreen();
console.log(chalk.cyan.bold('\nRabbitMQ Consumer\n'));

let connection;
let consumer;

let publishConnection;
let publisher;

// rabbitmq-client controls ACK/NACK by the handler return value:
// - return 0 / undefined => ack
// - return 1 => nack requeue=true
// - return 2 => nack requeue=false (dead-letter / drop)
const ACK = 0;
const REQUEUE = 1;
const DROP = 2;

function consumerNameFromPattern(pattern) {
  const normalized = String(pattern || '').trim() || 'unknown';
  // Keep it readable and terminal-friendly.
  // Example: "user.#" -> "topic:user.#"
  return `topic:${normalized}`;
}

function logConsumerParamsAndContent({ params, body, routingKey }) {
  for (const [k, v] of Object.entries(params || {})) {
    console.log(chalk.gray(`${k}: ${v}`));
  }
  if (routingKey) console.log(chalk.gray(`Routing key: ${routingKey}`));
  console.log('Content:');
  console.log(JSON.stringify(body ?? null, null, 2));
}

async function cleanupAll() {
  try {
    if (consumer) await consumer.close();
  } catch (e) {
    // ignore
  }
  try {
    if (connection) await connection.close();
  } catch (e) {
    // ignore
  }
  try {
    if (publisher) await publisher.close();
  } catch (e) {
    // ignore
  }
  try {
    if (publishConnection) await publishConnection.close();
  } catch (e) {
    // ignore
  }

  consumer = undefined;
  connection = undefined;
  publisher = undefined;
  publishConnection = undefined;
}

async function waitForUseCaseSwitchShortcut() {
  if (!process.stdin.isTTY) {
    // If not in a TTY, we cannot capture keypresses reliably. Just keep running.
    // Process stays alive because consumer connection is open.
    // User can still Ctrl+C externally.
    // eslint-disable-next-line no-empty-function
    return new Promise(() => {});
  }

  readline.emitKeypressEvents(process.stdin);
  try {
    process.stdin.setRawMode(true);
  } catch (e) {
    // ignore
  }
  process.stdin.resume();

  return await new Promise((resolve) => {
    const onKeyPress = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') return; // handled by SIGINT

      // Press "k" to clear terminal (stay in same use case)
      if (!key.ctrl && !key.meta && key.name === 'k') {
        clearScreen();
        console.log(chalk.cyan.bold('\nRabbitMQ Consumer\n'));
        console.log(chalk.gray('Shortcut: press "u" to change use case without restarting.'));
        console.log(chalk.gray('Shortcut: press "k" to clear the terminal.'));
        console.log(chalk.gray('Press Ctrl+C to exit.\n'));
        return;
      }

      // Press "u" to switch use case
      if (!key.ctrl && !key.meta && key.name === 'u') {
        process.stdin.off('keypress', onKeyPress);
        try {
          process.stdin.setRawMode(false);
        } catch (e) {
          // ignore
        }
        resolve();
      }
    };

    process.stdin.on('keypress', onKeyPress);
  });
}

async function enterRunningState() {
  console.log(chalk.gray('Shortcut: press "u" to change use case without restarting.'));
  console.log(chalk.gray('Shortcut: press "k" to clear the terminal.'));
  console.log(chalk.gray('Press Ctrl+C to exit.\n'));
  await waitForUseCaseSwitchShortcut();
  // Do not print anything here; the outer loop will clear the terminal immediately.
}

async function main() {
  const { useCaseId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'useCaseId',
      message: 'Select a consumer use case:',
      choices: USE_CASES.map((u) => ({ name: u.name, value: u.id }))
    }
  ]);

  const useCase = USE_CASES.find((u) => u.id === useCaseId);
  printUseCaseIntro(chalk, useCase);

  // Default: temporary queues where applicable to avoid persistent bindings between runs.
  connection = createConnection({ name: 'consumer' });
  await waitForConnection(connection);

  if (useCaseId === 'direct_logs') {
    const { routingKey } = await inquirer.prompt([
      { type: 'list', name: 'routingKey', message: 'Level to listen to:', choices: ['info', 'warning', 'error'] }
    ]);

    console.log(chalk.cyan('\nStarting direct logs consumer...'));
    console.log(chalk.gray(`Exchange: ${C.directLogs.exchange} (${C.directLogs.type})`));
    console.log(chalk.gray(`Routing key: ${routingKey}`));
    console.log(chalk.gray('Queue: (server-generated)\n'));

    consumer = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.directLogs.exchange, routingKey }],
        exchanges: [{ exchange: C.directLogs.exchange, type: C.directLogs.type, durable: true }],
        qos: { prefetchCount: 10 }
      },
      async (msg) => {
        console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] Message received`));
        logConsumerParamsAndContent({
          params: {
            'Consumer type': 'Direct exchange',
            Exchange: C.directLogs.exchange,
            'Consumer routing key': routingKey
          },
          routingKey: msg.routingKey,
          body: msg.body
        });
      }
    );

    await sleep(300);
    console.log(chalk.green('\nConsumer is ready.\n'));
    await enterRunningState();
    return;
  }

  if (useCaseId === 'fanout_notifications') {
    const { servicePreset, customServiceName } = await inquirer.prompt([
      {
        type: 'list',
        name: 'servicePreset',
        message: 'Service:',
        choices: [
          { name: 'Email worker', value: 'Email worker' },
          { name: 'SMS worker', value: 'SMS worker' },
          { name: 'Push worker', value: 'Push worker' },
          { name: 'Custom', value: 'custom' }
        ]
    },
    {
      type: 'input',
        name: 'customServiceName',
        message: 'Custom service name:',
        when: (a) => a.servicePreset === 'custom',
        default: 'Email worker'
      }
    ]);

    const serviceName = servicePreset === 'custom' ? customServiceName : servicePreset;

    console.log(chalk.cyan('\nStarting fanout notification consumer...'));
    console.log(chalk.gray(`Exchange: ${C.fanoutNotifications.exchange} (${C.fanoutNotifications.type})`));
    console.log(chalk.gray(`Service: ${serviceName}`));
    console.log(chalk.gray('Queue: (server-generated)\n'));

    consumer = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.fanoutNotifications.exchange, routingKey: '' }],
        exchanges: [{ exchange: C.fanoutNotifications.exchange, type: C.fanoutNotifications.type, durable: true }]
      },
      async (msg) => {
        console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] ${serviceName} received`));
        logConsumerParamsAndContent({
          params: {
            'Consumer type': 'Fanout exchange',
            Exchange: C.fanoutNotifications.exchange,
            Service: serviceName
          },
          body: msg.body
        });
      }
    );

    await sleep(300);
    console.log(chalk.green('\nConsumer is ready.\n'));
    await enterRunningState();
    return;
  }

  if (useCaseId === 'topic_events') {
    const { patternPreset, customPattern } = await inquirer.prompt([
      {
        type: 'list',
        name: 'patternPreset',
        message: 'Routing pattern:',
        choices: [
          { name: 'user.# (all user events)', value: 'user.#' },
          { name: '*.*.updated (all updates)', value: '*.*.updated' },
          { name: 'order.*.critical (critical order events)', value: 'order.*.critical' },
          { name: '# (everything)', value: '#' },
          { name: 'Custom', value: 'custom' }
        ],
        default: 'user.#'
      },
    {
      type: 'input',
        name: 'customPattern',
        message: 'Custom pattern:',
        when: (a) => a.patternPreset === 'custom',
        default: 'custom.#'
      }
    ]);

    const pattern = patternPreset === 'custom' ? customPattern : patternPreset;
    const name = consumerNameFromPattern(pattern);

    console.log(chalk.cyan('\nStarting topic events consumer...'));
    console.log(chalk.gray(`Exchange: ${C.topicEvents.exchange} (${C.topicEvents.type})`));
    console.log(chalk.gray(`Pattern: ${pattern}`));
    console.log(chalk.gray(`Name: ${name}`));
    console.log(chalk.gray('Queue: (server-generated)\n'));

    consumer = connection.createConsumer(
      {
    queue: '',
    queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.topicEvents.exchange, routingKey: pattern }],
        exchanges: [{ exchange: C.topicEvents.exchange, type: C.topicEvents.type, durable: true }]
      },
      async (msg) => {
        console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] ${name} received`));
        logConsumerParamsAndContent({
          params: {
            'Consumer type': 'Topic exchange',
            Exchange: C.topicEvents.exchange,
            Pattern: pattern,
            Name: name
          },
          routingKey: msg.routingKey,
          body: msg.body
        });
      }
    );

    await sleep(300);
    console.log(chalk.green('\nConsumer is ready.\n'));
    await enterRunningState();
    return;
  }

  if (useCaseId === 'work_queue') {
    const {
      workerPreset,
      customWorkerName,
      prefetchPreset,
      customPrefetchCount,
      concurrencyPreset,
      customConcurrency
    } = await inquirer.prompt([
      {
        type: 'list',
        name: 'workerPreset',
        message: 'Worker:',
        choices: [
          { name: 'Worker 1', value: 'Worker 1' },
          { name: 'Worker 2', value: 'Worker 2' },
          { name: 'Worker 3', value: 'Worker 3' },
          { name: 'Custom', value: 'custom' }
        ]
      },
    {
      type: 'input',
        name: 'customWorkerName',
        message: 'Custom worker name:',
        when: (a) => a.workerPreset === 'custom',
        default: 'Worker 1'
      },
      {
        type: 'list',
        name: 'prefetchPreset',
        message: 'prefetchCount (QoS):',
        choices: [
          { name: '1 (fair dispatch)', value: 1 },
          { name: '5', value: 5 },
          { name: '10', value: 10 },
          { name: 'Custom', value: 'custom' }
        ],
        default: C.workQueue.defaultPrefetch
      },
      {
        type: 'number',
        name: 'customPrefetchCount',
        message: 'Custom prefetchCount:',
        when: (a) => a.prefetchPreset === 'custom',
        default: C.workQueue.defaultPrefetch
      },
      {
        type: 'list',
        name: 'concurrencyPreset',
        message: 'Concurrency (parallel handlers):',
        choices: [
          { name: '1 (default)', value: 1 },
          { name: '2', value: 2 },
          { name: '5', value: 5 },
          { name: '10', value: 10 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 1
      },
      {
        type: 'number',
        name: 'customConcurrency',
        message: 'Custom concurrency:',
        when: (a) => a.concurrencyPreset === 'custom',
        default: 1
      }
    ]);

    const workerName = workerPreset === 'custom' ? customWorkerName : workerPreset;
    const prefetchCount = prefetchPreset === 'custom' ? customPrefetchCount : prefetchPreset;
    const concurrency = concurrencyPreset === 'custom' ? customConcurrency : concurrencyPreset;

    console.log(chalk.cyan('\nStarting work queue worker...'));
    console.log(chalk.gray(`Queue: ${C.workQueue.queue}`));
    console.log(chalk.gray(`Worker: ${workerName}`));
    console.log(chalk.gray(`prefetchCount: ${prefetchCount}\n`));
    console.log(chalk.gray(`concurrency: ${concurrency}\n`));
    console.log(chalk.gray('Tip: to see QoS differences, publish a batch of tasks quickly from the producer.\n'));

    consumer = connection.createConsumer(
      {
        queue: C.workQueue.queue,
        queueOptions: { durable: true },
        qos: { prefetchCount },
        concurrency
      },
      async (msg) => {
        console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] ${workerName} received task`));
        logConsumerParamsAndContent({
          params: {
            'Consumer type': 'Work queue',
            Queue: C.workQueue.queue,
            Worker: workerName,
            prefetchCount,
            concurrency
          },
          body: msg.body
        });
        await sleep(Number((msg.body && msg.body.durationMs) || 1000));
        return ACK;
      }
    );

    await sleep(300);
    console.log(chalk.green('\nWorker is ready.\n'));
    await enterRunningState();
    return;
  }

  if (useCaseId === 'reliable_tasks_retry_dlq') {
    const { role } = await inquirer.prompt([
      {
        type: 'list',
        name: 'role',
        message: 'Role:',
        choices: [
          { name: 'Main worker', value: 'worker' },
          { name: 'DLQ inspector', value: 'dlq' }
        ]
      }
    ]);

    if (role === 'dlq') {
      console.log(chalk.cyan('\nStarting DLQ inspector...'));
      console.log(chalk.gray(`DLQ: ${C.reliableTasks.dlqQueue}\n`));

      consumer = connection.createConsumer(
        {
          queue: C.reliableTasks.dlqQueue,
          queueOptions: { durable: true },
          queueBindings: [{ exchange: C.reliableTasks.dlxExchange, routingKey: C.reliableTasks.failedKey }],
          exchanges: [{ exchange: C.reliableTasks.dlxExchange, type: C.reliableTasks.dlxType, durable: true }]
        },
        async (msg) => {
          console.log(chalk.red(`\n[${new Date().toLocaleTimeString()}] DLQ message received`));
          logConsumerParamsAndContent({
            params: {
              'Consumer type': 'Reliable tasks - DLQ inspector',
              DLQ: C.reliableTasks.dlqQueue,
              'DLX exchange': C.reliableTasks.dlxExchange,
              'DLX routing key': C.reliableTasks.failedKey
            },
            body: msg.body
          });
          return ACK;
        }
      );

      await sleep(300);
      console.log(chalk.green('\nDLQ inspector is ready.\n'));
      await enterRunningState();
      return;
    }

    const {
      workerPreset,
      customWorkerName,
      failRatePreset,
      customFailRatePct,
      maxRetriesPreset,
      customMaxRetries,
      retryDelayPreset,
      customRetryDelayMs
    } = await inquirer.prompt([
      {
        type: 'list',
        name: 'workerPreset',
        message: 'Worker:',
        choices: [
          { name: 'Reliable Worker 1', value: 'Reliable Worker 1' },
          { name: 'Reliable Worker 2', value: 'Reliable Worker 2' },
          { name: 'Custom', value: 'custom' }
        ],
        default: 'Reliable Worker 1'
    },
    {
      type: 'input',
        name: 'customWorkerName',
        message: 'Custom worker name:',
        when: (a) => a.workerPreset === 'custom',
        default: 'Reliable Worker 1'
      },
      {
        type: 'list',
        name: 'failRatePreset',
        message: 'Simulated failure rate:',
        choices: [
          { name: '0% (never fail)', value: 0 },
          { name: '30% (default)', value: 30 },
          { name: '60% (often fail)', value: 60 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 30
      },
      {
        type: 'number',
        name: 'customFailRatePct',
        message: 'Custom failure rate (0-100):',
        when: (a) => a.failRatePreset === 'custom',
        default: 30
      },
      {
        type: 'list',
        name: 'maxRetriesPreset',
        message: 'Max retries before DLQ:',
        choices: [
          { name: '1', value: 1 },
          { name: '3 (default)', value: 3 },
          { name: '5', value: 5 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 3
      },
      {
        type: 'number',
        name: 'customMaxRetries',
        message: 'Custom max retries:',
        when: (a) => a.maxRetriesPreset === 'custom',
        default: 3
      },
      {
        type: 'list',
        name: 'retryDelayPreset',
        message: 'Retry delay:',
        choices: [
          { name: '3000 ms', value: 3000 },
          { name: '5000 ms (default)', value: 5000 },
          { name: '10000 ms', value: 10000 },
          { name: 'Custom', value: 'custom' }
        ],
        default: 5000
      },
      {
        type: 'number',
        name: 'customRetryDelayMs',
        message: 'Custom retry delay (ms):',
        when: (a) => a.retryDelayPreset === 'custom',
        default: 5000
      }
    ]);

    const workerName = workerPreset === 'custom' ? customWorkerName : workerPreset;
    const failRatePct = failRatePreset === 'custom' ? customFailRatePct : failRatePreset;
    const maxRetries = maxRetriesPreset === 'custom' ? customMaxRetries : maxRetriesPreset;
    const retryDelayMs = retryDelayPreset === 'custom' ? customRetryDelayMs : retryDelayPreset;

    // Best practice (section 5): separate connections for consume and publish.
    publishConnection = createConnection({ name: `publisher:${workerName}` });
    await waitForConnection(publishConnection);
    publisher = publishConnection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.reliableTasks.exchange, type: C.reliableTasks.exchangeType, durable: true }]
    });

    // Declare retry queue with TTL -> dead-letter back to main
    const retryAsserter = connection.createConsumer(
      {
        queue: C.reliableTasks.retryQueue,
        queueOptions: {
          durable: true,
          arguments: {
            'x-message-ttl': retryDelayMs,
            'x-dead-letter-exchange': C.reliableTasks.exchange,
            'x-dead-letter-routing-key': C.reliableTasks.mainKey
          }
        },
        queueBindings: [{ exchange: C.reliableTasks.exchange, routingKey: C.reliableTasks.retryKey }],
        exchanges: [{ exchange: C.reliableTasks.exchange, type: C.reliableTasks.exchangeType, durable: true }]
      },
      async () => {}
    );
    await retryAsserter.close();

    console.log(chalk.cyan('\nStarting reliable tasks worker...'));
    console.log(chalk.gray(`Main queue: ${C.reliableTasks.mainQueue}`));
    console.log(chalk.gray(`Retry queue: ${C.reliableTasks.retryQueue} (ttl=${retryDelayMs}ms)`));
    console.log(chalk.gray(`DLQ: ${C.reliableTasks.dlqQueue}`));
    console.log(chalk.gray(`failRate=${failRatePct}% maxRetries=${maxRetries}\n`));

    consumer = connection.createConsumer(
      {
        queue: C.reliableTasks.mainQueue,
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': C.reliableTasks.dlxExchange,
            'x-dead-letter-routing-key': C.reliableTasks.failedKey
          }
        },
        queueBindings: [{ exchange: C.reliableTasks.exchange, routingKey: C.reliableTasks.mainKey }],
        exchanges: [
          { exchange: C.reliableTasks.exchange, type: C.reliableTasks.exchangeType, durable: true },
          { exchange: C.reliableTasks.dlxExchange, type: C.reliableTasks.dlxType, durable: true }
        ],
        qos: { prefetchCount: 1 }
      },
      async (msg) => {
        const task = msg.body || {};
        const retryCount = Number(task.retryCount || 0);

        console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] ${workerName} received`));
        logConsumerParamsAndContent({
          params: {
            'Consumer type': 'Reliable tasks - worker',
            'Main queue': C.reliableTasks.mainQueue,
            'Retry queue': C.reliableTasks.retryQueue,
            DLQ: C.reliableTasks.dlqQueue,
            workerName,
            maxRetries,
            retryDelayMs,
            failRatePct
          },
          body: task
        });

        await sleep(Number(task.durationMs || 1000));

        const shouldFail = Math.random() < Math.max(0, Math.min(1, failRatePct / 100));
        if (!shouldFail) {
          return ACK;
        }

        if (retryCount < maxRetries) {
          const next = {
            ...task,
            retryCount: retryCount + 1,
            lastError: 'simulated_failure',
            lastFailedAt: new Date().toISOString()
          };

          await publisher.send(
            { exchange: C.reliableTasks.exchange, routingKey: C.reliableTasks.retryKey },
            next,
            { deliveryMode: 2 }
          );
          return ACK;
        }

        console.log(chalk.red('Failed. Sending to DLQ (nack requeue=false).'));
        return DROP;
      }
    );

    await sleep(300);
    console.log(chalk.green('\nWorker is ready.\n'));
    await enterRunningState();
    return;
  }

  // ecommerce_pipeline
  const { role } = await inquirer.prompt([
    {
      type: 'list',
      name: 'role',
      message: 'Service role:',
      choices: [
        { name: 'Payment service', value: 'payment' },
        { name: 'Inventory service', value: 'inventory' },
        { name: 'Notification service', value: 'notifications' },
        { name: 'Analytics service', value: 'analytics' }
      ]
    }
  ]);

  const queueName = C.ecommerce.queues[role];

  // Payment/inventory also publish events -> separate publish connection.
  if (role === 'payment' || role === 'inventory') {
    publishConnection = createConnection({ name: `publisher:${role}` });
    await waitForConnection(publishConnection);
    publisher = publishConnection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.ecommerce.exchange, type: C.ecommerce.exchangeType, durable: true }]
    });
  }

  console.log(chalk.cyan(`\nStarting e-commerce service: ${role}`));
  console.log(chalk.gray(`Exchange: ${C.ecommerce.exchange} (${C.ecommerce.exchangeType})`));
  console.log(chalk.gray(`Queue: ${queueName}\n`));

  const bindingsByRole = {
    payment: ['order.created', 'inventory.failed'],
    inventory: ['order.created', 'payment.failed'],
    // Notifications should be user-facing (avoid confusing sequences like: created -> failed -> paid).
    // We listen to the "decision" events and only print meaningful notifications.
    notifications: [
      'inventory.reserved',
      'order.failed',
      'order.shipped',
      'inventory.failed',
      'payment.failed',
      'payment.refunded',
      'inventory.released'
    ],
    analytics: ['#']
  };

  const paidOrders = new Map(); // orderId -> amount (very simple in-memory state for the demo)
  const notificationState = new Map(); // orderId -> state for user-facing notification ordering

  // Durable queues keep bindings between runs; after code changes this can cause confusing routing.
  // For this interactive demo we prefer a clean slate each time you start a role.
  try {
    await connection.queueDelete(queueName);
  } catch {
    // ignore (queue might not exist yet)
  }

  consumer = connection.createConsumer(
    {
      queue: queueName,
      queueOptions: { durable: true },
      queueBindings: bindingsByRole[role].map((rk) => ({ exchange: C.ecommerce.exchange, routingKey: rk })),
      exchanges: [{ exchange: C.ecommerce.exchange, type: C.ecommerce.exchangeType, durable: true }],
      qos: { prefetchCount: role === 'analytics' ? 10 : 1 }
    },
    async (msg) => {
      const body = msg.body || {};
      const rk = msg.routingKey;
      const orderId = body.orderId;

      console.log(chalk.green(`\n[${new Date().toLocaleTimeString()}] ${role} received: ${rk}`));
      logConsumerParamsAndContent({
        params: {
          'Consumer type': 'E-commerce service',
          Role: role,
          Queue: queueName,
          Exchange: C.ecommerce.exchange
        },
        routingKey: rk,
        body
      });

      // Make notifications user-facing and ordered (avoid printing every raw domain event as if it was an email).
      if (role === 'notifications' && orderId) {
        const st =
          notificationState.get(orderId) || {
            failed: false,
            paymentFailed: false,
            inventoryReleased: false,
            refunded: false,
            shipped: false,
            inventoryReserved: false,
            notifiedReserved: false,
            notifiedFail: false,
            notifiedPaymentFail: false,
            notifiedRefund: false,
            notifiedShipped: false
          };

        if (rk === 'inventory.reserved') st.inventoryReserved = true;
        if (rk === 'inventory.failed' || rk === 'order.failed') st.failed = true;
        if (rk === 'payment.failed') st.paymentFailed = true;
        if (rk === 'inventory.released') st.inventoryReleased = true;
        if (rk === 'payment.refunded') st.refunded = true;
        if (rk === 'order.shipped') st.shipped = true;

        // Success-ish notification when stock is reserved (doesn't depend on payment.completed)
        if (rk === 'inventory.reserved' && !st.notifiedReserved && !st.failed && !st.paymentFailed) {
          console.log(chalk.yellow('\nUser notification (email):'));
          console.log(chalk.yellow(`- Order ${orderId} confirmed: items reserved.`));
          st.notifiedReserved = true;
        }

        // Failure notification (out-of-stock etc.)
        if (st.failed && !st.notifiedFail) {
          console.log(chalk.yellow('\nUser notification (email/sms/push):'));
          console.log(
            chalk.yellow(
              `- Order ${orderId} failed: ${body.reason || 'unavailable'}.\n  If you were charged, you will be refunded shortly.`
            )
          );
          st.notifiedFail = true;
        }

        // Payment failed notification (payment service handles it; inventory reservation will be released)
        if (rk === 'payment.failed' && !st.notifiedPaymentFail) {
          console.log(chalk.yellow('\nUser notification (email/sms/push):'));
          console.log(
            chalk.yellow(
              `- Payment failed for order ${orderId}. Reason: ${body.reason || 'payment_failed'}.\n  The order is cancelled${
                st.inventoryReleased ? ' and inventory reservation was released.' : '; inventory reservation will be released.'
              }`
            )
          );
          st.notifiedPaymentFail = true;
        }

        // Refund notification (compensation completed)
        if (rk === 'payment.refunded' && !st.notifiedRefund) {
          console.log(chalk.yellow('\nUser notification (email):'));
          console.log(chalk.yellow(`- Refund completed for order ${orderId}. Amount: ${body.amount}`));
          st.notifiedRefund = true;
        }

        // Shipped notification
        if (rk === 'order.shipped' && !st.notifiedShipped && !st.failed && !st.paymentFailed) {
          console.log(chalk.yellow('\nUser notification (email):'));
          console.log(chalk.yellow(`- Order ${orderId} shipped.`));
          st.notifiedShipped = true;
        }

        notificationState.set(orderId, st);
      }

      if (!publisher) {
        return ACK;
      }

      // Minimal simulation of side effects:
      if (role === 'payment' && rk === 'order.created') {
        await sleep(900);
        if (body.forcePaymentFail) {
          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'payment.failed' },
            {
              orderId: body.orderId,
              amount: body.amount,
              reason: 'card_declined',
              timestamp: new Date().toISOString()
            },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: payment.failed'));
        } else {
          // Payment succeeds and we remember it so we can refund on inventory failure.
          paidOrders.set(body.orderId, body.amount);
          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'payment.completed' },
            { orderId: body.orderId, amount: body.amount, timestamp: new Date().toISOString() },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: payment.completed'));
        }
      }

      if (role === 'payment' && rk === 'inventory.failed') {
        await sleep(400);
        const paidAmount = paidOrders.get(body.orderId);
        if (typeof paidAmount === 'number') {
          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'payment.refunded' },
            {
              orderId: body.orderId,
              amount: paidAmount,
              reason: body.reason || 'inventory_unavailable',
              timestamp: new Date().toISOString()
            },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: payment.refunded (compensation)'));
          paidOrders.delete(body.orderId);
        } else {
          console.log(chalk.gray('Skip refund (order not recorded as paid in this payment process).'));
        }
      }

      if (role === 'inventory' && rk === 'order.created') {
        // Simulate slower inventory check (more realistic ordering vs payment).
        await sleep(3000);
        if (body.forcePaymentFail) {
          console.log(chalk.gray('Skip inventory reservation (payment-failed scenario).'));
          return ACK;
        }
        if (body.forceOutOfStock) {
          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'inventory.failed' },
            {
              orderId: body.orderId,
              reason: 'out_of_stock',
              items: body.items || [{ sku: 'book_1', qty: 1 }],
              timestamp: new Date().toISOString()
            },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: inventory.failed'));

          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'order.failed' },
            {
              orderId: body.orderId,
              reason: 'out_of_stock',
              timestamp: new Date().toISOString()
            },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: order.failed'));
        } else {
          await publisher.send(
            { exchange: C.ecommerce.exchange, routingKey: 'inventory.reserved' },
            { orderId: body.orderId, items: body.items || [{ sku: 'book_1', qty: 1 }], timestamp: new Date().toISOString() },
            { deliveryMode: 2 }
          );
          console.log(chalk.gray('Published: inventory.reserved'));
        }
      }

      if (role === 'inventory' && rk === 'payment.failed') {
        await sleep(400);
        await publisher.send(
          { exchange: C.ecommerce.exchange, routingKey: 'inventory.released' },
          {
            orderId: body.orderId,
            reason: body.reason || 'payment_failed',
            timestamp: new Date().toISOString()
          },
          { deliveryMode: 2 }
        );
        console.log(chalk.gray('Published: inventory.released (compensation)'));
      }

      return ACK;
    }
  );

  await sleep(300);
  console.log(chalk.green('\nService is ready.\n'));
  await enterRunningState();
}

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\nStopping consumer...\n'));
  await cleanupAll();
  process.exit(0);
});

async function run() {
  // Loop forever; "u" triggers cleanup + re-prompt without restarting the process.
  while (true) {
    await cleanupAll();
    clearScreen();
    console.log(chalk.cyan.bold('\nRabbitMQ Consumer\n'));
    await main();
  }
}

run().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
