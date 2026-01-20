#!/usr/bin/env node

const inquirer = require('inquirer');
const chalk = require('chalk');
const { createConnection, waitForConnection } = require('../utils/connection');
const { USE_CASES } = require('./useCases');
const C = require('./rabbitConstants');
const { sleep, clearScreen, printUseCaseIntro } = require('./helpers');
const { parseArgs, getNumber } = require('./cliArgs');

clearScreen();
console.log(chalk.cyan.bold('\nRabbitMQ Producer\n'));

let connection;
let publisher;

async function selectUseCase() {
  const { useCaseId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'useCaseId',
      message: 'Select a use case:',
      choices: USE_CASES.map((u) => ({ name: u.name, value: u.id }))
    }
  ]);
  return USE_CASES.find((u) => u.id === useCaseId);
}

function resolveUseCaseById(useCaseId) {
  return USE_CASES.find((u) => u.id === useCaseId);
}

async function ensureInfrastructure(useCaseId) {
  // Warm-up: declare exchanges/queues to avoid first-message races.
  const noop = async () => {};
  const waitReady = async (c) => {
    // rabbitmq-client Consumer emits 'ready' when setup is complete
    await Promise.race([
      new Promise((resolve) => c.once('ready', resolve)),
      sleep(1500)
    ]);
  };

  if (useCaseId === 'direct_logs') {
    const temp = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.directLogs.exchange, routingKey: 'info' }],
        exchanges: [{ exchange: C.directLogs.exchange, type: C.directLogs.type, durable: true }]
      },
      noop
    );
    await waitReady(temp);
    await temp.close();
    return;
  }

  if (useCaseId === 'fanout_notifications') {
    const temp = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.fanoutNotifications.exchange, routingKey: '' }],
        exchanges: [{ exchange: C.fanoutNotifications.exchange, type: C.fanoutNotifications.type, durable: true }]
      },
      noop
    );
    await waitReady(temp);
    await temp.close();
    return;
  }

  if (useCaseId === 'topic_events') {
    const temp = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.topicEvents.exchange, routingKey: '#' }],
        exchanges: [{ exchange: C.topicEvents.exchange, type: C.topicEvents.type, durable: true }]
      },
      noop
    );
    await waitReady(temp);
    await temp.close();
    return;
  }

  if (useCaseId === 'work_queue') {
    const temp = connection.createConsumer(
      {
        queue: C.workQueue.queue,
        queueOptions: { durable: true },
        qos: { prefetchCount: C.workQueue.defaultPrefetch }
      },
      noop
    );
    await waitReady(temp);
    await temp.close();
    return;
  }

  if (useCaseId === 'reliable_tasks_retry_dlq') {
    // Declare main queue (with DLX), retry queue (TTL), DLQ and exchanges.
    const tempMain = connection.createConsumer(
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
        ]
      },
      noop
    );
    await waitReady(tempMain);
    await tempMain.close();

    const tempRetry = connection.createConsumer(
      {
        queue: C.reliableTasks.retryQueue,
        queueOptions: {
          durable: true,
          arguments: {
            'x-message-ttl': 5000,
            'x-dead-letter-exchange': C.reliableTasks.exchange,
            'x-dead-letter-routing-key': C.reliableTasks.mainKey
          }
        },
        queueBindings: [{ exchange: C.reliableTasks.exchange, routingKey: C.reliableTasks.retryKey }],
        exchanges: [{ exchange: C.reliableTasks.exchange, type: C.reliableTasks.exchangeType, durable: true }]
      },
      noop
    );
    await waitReady(tempRetry);
    await tempRetry.close();

    const tempDlq = connection.createConsumer(
      {
        queue: C.reliableTasks.dlqQueue,
        queueOptions: { durable: true },
        queueBindings: [{ exchange: C.reliableTasks.dlxExchange, routingKey: C.reliableTasks.failedKey }],
        exchanges: [{ exchange: C.reliableTasks.dlxExchange, type: C.reliableTasks.dlxType, durable: true }]
      },
      noop
    );
    await waitReady(tempDlq);
    await tempDlq.close();
    return;
  }

  if (useCaseId === 'ecommerce_pipeline') {
    const temp = connection.createConsumer(
      {
        queue: '',
        queueOptions: { exclusive: true, autoDelete: true },
        queueBindings: [{ exchange: C.ecommerce.exchange, routingKey: '#' }],
        exchanges: [{ exchange: C.ecommerce.exchange, type: C.ecommerce.exchangeType, durable: true }]
      },
      noop
    );
    await waitReady(temp);
    await temp.close();
  }
}

async function createPublisherForUseCase(useCaseId) {
  if (publisher) {
    try {
      await publisher.close();
    } catch (e) {
      // ignore
    }
    publisher = undefined;
  }

  if (useCaseId === 'direct_logs') {
    publisher = connection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.directLogs.exchange, type: C.directLogs.type, durable: true }]
    });
    return;
  }

  if (useCaseId === 'fanout_notifications') {
    publisher = connection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.fanoutNotifications.exchange, type: C.fanoutNotifications.type, durable: true }]
    });
    return;
  }

  if (useCaseId === 'topic_events') {
    publisher = connection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.topicEvents.exchange, type: C.topicEvents.type, durable: true }]
    });
    return;
  }

  if (useCaseId === 'work_queue') {
    publisher = connection.createPublisher({ confirm: true });
    return;
  }

  if (useCaseId === 'reliable_tasks_retry_dlq') {
    publisher = connection.createPublisher({
      confirm: true,
      exchanges: [
        { exchange: C.reliableTasks.exchange, type: C.reliableTasks.exchangeType, durable: true },
        { exchange: C.reliableTasks.dlxExchange, type: C.reliableTasks.dlxType, durable: true }
      ]
    });
    return;
  }

  if (useCaseId === 'ecommerce_pipeline') {
    publisher = connection.createPublisher({
      confirm: true,
      exchanges: [{ exchange: C.ecommerce.exchange, type: C.ecommerce.exchangeType, durable: true }]
    });
  }
}

async function promptNext() {
  return await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What next?',
      choices: [
        { name: 'Send another message', value: 'continue' },
        { name: 'Change use case', value: 'change' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);
}

async function promptMessageForUseCase(useCaseId) {
  if (useCaseId === 'direct_logs') {
    return await inquirer.prompt([
      { type: 'list', name: 'routingKey', message: 'Level:', choices: ['info', 'warning', 'error'] },
      { type: 'input', name: 'message', message: 'Log message:', default: 'Sample log message' }
    ]);
  }

  if (useCaseId === 'fanout_notifications') {
    return await inquirer.prompt([
      { type: 'input', name: 'user', message: 'User:', default: 'user@example.com' },
      { type: 'input', name: 'message', message: 'Notification:', default: 'Your order has shipped' }
    ]);
  }

  if (useCaseId === 'topic_events') {
    return await inquirer.prompt([
      {
        type: 'list',
        name: 'routingKey',
        message: 'Routing key:',
        choices: [
          'user.created',
          'user.profile.updated',
          'order.created',
          'order.payment.critical',
          'product.inventory.updated',
          { name: 'Custom', value: 'custom' }
        ]
      },
      {
        type: 'input',
        name: 'customKey',
        message: 'Custom routing key:',
        when: (a) => a.routingKey === 'custom',
        default: 'custom.event.name'
      },
      {
        type: 'input',
        name: 'payload',
        message: 'Payload JSON:',
        default: '{"id":"123","data":"example"}'
      }
    ]);
  }

  if (useCaseId === 'work_queue') {
    return await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'Send mode:',
        choices: [
          { name: 'Single task', value: 'single' },
          { name: 'Batch (send many tasks quickly)', value: 'batch' }
        ],
        default: 'batch'
      },
      {
        type: 'input',
        name: 'taskName',
        message: 'Task name:',
        when: (a) => a.mode === 'single',
        default: 'Generate PDF'
      },
      {
        type: 'number',
        name: 'durationMs',
        message: 'Simulated processing time (ms):',
        when: (a) => a.mode === 'single',
        default: 1500
      },
      {
        type: 'input',
        name: 'batchPrefix',
        message: 'Batch task name prefix:',
        when: (a) => a.mode === 'batch',
        default: 'Task'
      },
      {
        type: 'number',
        name: 'batchCount',
        message: 'How many tasks:',
        when: (a) => a.mode === 'batch',
        default: 20
      },
      {
        type: 'number',
        name: 'minDurationMs',
        message: 'Min duration (ms):',
        when: (a) => a.mode === 'batch',
        default: 500
      },
      {
        type: 'number',
        name: 'maxDurationMs',
        message: 'Max duration (ms):',
        when: (a) => a.mode === 'batch',
        default: 2500
      }
    ]);
  }

  if (useCaseId === 'reliable_tasks_retry_dlq') {
    return await inquirer.prompt([
      { type: 'input', name: 'taskName', message: 'Task name:', default: 'Charge payment' },
      { type: 'number', name: 'durationMs', message: 'Simulated processing time (ms):', default: 800 }
    ]);
  }

  // ecommerce_pipeline
  return await inquirer.prompt([
    {
      type: 'list',
      name: 'routingKey',
      message: 'Event:',
      choices: ['order.created', 'order.shipped']
    },
    { type: 'input', name: 'orderId', message: 'Order ID:', default: `order_${Date.now()}` },
    { type: 'input', name: 'userId', message: 'User ID:', when: (a) => a.routingKey === 'order.created', default: 'user_123' },
    { type: 'number', name: 'amount', message: 'Amount:', when: (a) => a.routingKey === 'order.created', default: 49.99 },
    {
      type: 'list',
      name: 'scenario',
      message: 'Scenario:',
      when: (a) => a.routingKey === 'order.created',
      choices: [
        { name: 'Success (inventory available)', value: 'success' },
        { name: 'Order failed (inventory out of stock) - section 7', value: 'out_of_stock' },
        { name: 'Payment failed (cancel + release inventory) - section 7', value: 'payment_failed' }
      ],
      default: 'success'
    }
  ]);
}

async function publishForUseCase(useCaseId, input) {
  if (useCaseId === 'direct_logs') {
    const payload = { message: input.message, timestamp: new Date().toISOString() };
    await publisher.send(
      { exchange: C.directLogs.exchange, routingKey: input.routingKey },
      payload,
      { deliveryMode: 2 }
    );
    console.log(chalk.green(`\nPublished (${input.routingKey}): ${input.message}`));
    return;
  }

  if (useCaseId === 'fanout_notifications') {
    const payload = { user: input.user, message: input.message, timestamp: new Date().toISOString() };
    await publisher.send({ exchange: C.fanoutNotifications.exchange, routingKey: '' }, payload, { deliveryMode: 2 });
    console.log(chalk.green('\nBroadcast published.'));
    return;
  }

  if (useCaseId === 'topic_events') {
    const key = input.customKey || input.routingKey;
    let body;
    try {
      body = JSON.parse(input.payload);
    } catch {
      body = { raw: input.payload };
    }
    body.timestamp = new Date().toISOString();
    await publisher.send({ exchange: C.topicEvents.exchange, routingKey: key }, body, { deliveryMode: 2 });
    console.log(chalk.green(`\nPublished (${key}).`));
    return;
  }

  if (useCaseId === 'work_queue') {
    if (input.mode === 'batch') {
      const count = Math.max(1, Number(input.batchCount || 1));
      const minD = Math.max(0, Number(input.minDurationMs || 0));
      const maxD = Math.max(minD, Number(input.maxDurationMs || minD));

      for (let i = 1; i <= count; i++) {
        const durationMs = Math.floor(minD + Math.random() * (maxD - minD));
        const payload = {
          id: `task_${Date.now()}_${i}`,
          name: `${input.batchPrefix || 'Task'} ${i}`,
          durationMs,
          timestamp: new Date().toISOString()
        };
        await publisher.send(C.workQueue.queue, payload, { deliveryMode: 2 });
      }

      console.log(chalk.green(`\nQueued ${count} tasks.`));
      return;
    }

    const payload = {
      id: `task_${Date.now()}`,
      name: input.taskName,
      durationMs: input.durationMs,
      timestamp: new Date().toISOString()
    };
    await publisher.send(C.workQueue.queue, payload, { deliveryMode: 2 });
    console.log(chalk.green('\nTask queued.'));
    return;
  }

  if (useCaseId === 'reliable_tasks_retry_dlq') {
    const payload = {
      id: `task_${Date.now()}`,
      name: input.taskName,
      durationMs: input.durationMs,
      retryCount: 0,
      timestamp: new Date().toISOString()
    };
    await publisher.send({ exchange: C.reliableTasks.exchange, routingKey: C.reliableTasks.mainKey }, payload, { deliveryMode: 2 });
    console.log(chalk.green('\nReliable task published.'));
    return;
  }

  // ecommerce_pipeline
  if (input.routingKey === 'order.created') {
    const payload = {
      orderId: input.orderId,
      userId: input.userId,
      amount: input.amount,
      items: [{ sku: 'book_1', qty: 1 }],
      forceOutOfStock: input.scenario === 'out_of_stock',
      forcePaymentFail: input.scenario === 'payment_failed',
      timestamp: new Date().toISOString()
    };
    await publisher.send({ exchange: C.ecommerce.exchange, routingKey: 'order.created' }, payload, { deliveryMode: 2 });
    console.log(chalk.green('\nPublished order.created.'));
  } else {
    const payload = { orderId: input.orderId, timestamp: new Date().toISOString() };
    await publisher.send({ exchange: C.ecommerce.exchange, routingKey: 'order.shipped' }, payload, { deliveryMode: 2 });
    console.log(chalk.green('\nPublished order.shipped.'));
  }
}

async function runDemoLoop(useCaseId, options) {
  const intervalMs = getNumber(options.intervalMs, 2500);
  let counter = 0;
  console.log(chalk.magenta(`\nDemo mode: sending messages every ${intervalMs}ms. Press Ctrl+C to stop.\n`));

  while (true) {
    counter += 1;

    if (useCaseId === 'direct_logs') {
      const levels = ['info', 'warning', 'error'];
      const routingKey = levels[counter % levels.length];
      await publishForUseCase(useCaseId, {
        routingKey,
        message: `Auto log ${counter} (${routingKey})`
      });
    } else if (useCaseId === 'fanout_notifications') {
      await publishForUseCase(useCaseId, {
        user: `demo_user_${counter}@example.com`,
        message: `Your order update #${counter}`
      });
    } else if (useCaseId === 'topic_events') {
      const routingKeys = ['user.created', 'order.payment.critical', 'product.inventory.updated'];
      const routingKey = routingKeys[counter % routingKeys.length];
      await publishForUseCase(useCaseId, {
        routingKey,
        payload: JSON.stringify({ id: `evt_${counter}`, tag: routingKey })
      });
    } else if (useCaseId === 'work_queue') {
      await publishForUseCase(useCaseId, {
        mode: 'batch',
        batchPrefix: 'Auto Task',
        batchCount: 5,
        minDurationMs: 400,
        maxDurationMs: 1800
      });
    } else if (useCaseId === 'reliable_tasks_retry_dlq') {
      await publishForUseCase(useCaseId, {
        taskName: `Charge payment #${counter}`,
        durationMs: 800
      });
    } else if (useCaseId === 'ecommerce_pipeline') {
      const scenarios = ['success', 'out_of_stock', 'payment_failed'];
      const scenario = scenarios[counter % scenarios.length];
      await publishForUseCase(useCaseId, {
        routingKey: 'order.created',
        orderId: `order_${Date.now()}_${counter}`,
        userId: `user_${counter}`,
        amount: 49.99,
        scenario
      });
    }

    await sleep(intervalMs);
  }
}

async function main() {
  const options = parseArgs();

  connection = createConnection({ name: 'producer' });
  await waitForConnection(connection);

  let useCase = options.useCase ? resolveUseCaseById(options.useCase) : await selectUseCase();
  if (!useCase) {
    console.log(chalk.red('Unknown use case. Please check the --use-case value.'));
    process.exit(1);
  }
  clearScreen();
  console.log(chalk.cyan.bold('\nRabbitMQ Producer\n'));
  printUseCaseIntro(chalk, useCase);
  await ensureInfrastructure(useCase.id);
  await createPublisherForUseCase(useCase.id);
  await sleep(200);

  if (options.demo) {
    await runDemoLoop(useCase.id, options);
    return;
  }

  while (true) {
    const input = await promptMessageForUseCase(useCase.id);
    await publishForUseCase(useCase.id, input);

    const { action } = await promptNext();
    if (action === 'continue') continue;
    if (action === 'change') {
      useCase = await selectUseCase();
      clearScreen();
      console.log(chalk.cyan.bold('\nRabbitMQ Producer\n'));
      printUseCaseIntro(chalk, useCase);
      await ensureInfrastructure(useCase.id);
      await createPublisherForUseCase(useCase.id);
      await sleep(200);
      continue;
    }
    break;
  }

  console.log(chalk.yellow('\nClosing producer...\n'));
  if (publisher) await publisher.close();
  await connection.close();
}

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\nClosing producer...\n'));
  try {
    if (publisher) await publisher.close();
    if (connection) await connection.close();
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
