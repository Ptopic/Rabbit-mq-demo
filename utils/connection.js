const rabbit = require('rabbitmq-client');

const RABBITMQ_URL = 'amqp://user:root@localhost:5672';

/**
 * Creates a new RabbitMQ connection
 * @returns {rabbit.Connection}
 */
function createConnection(options = {}) {
  const { name } = options;
  const prefix = name ? `[${name}] ` : '';

  const connection = new rabbit.Connection({
    url: RABBITMQ_URL,
    retryLow: 1000,
    retryHigh: 30000
  });

  connection.on('error', (err) => {
    console.error(`${prefix}Connection error:`, err.message);
  });

  connection.on('connection', () => {
    console.log(`${prefix}Connected to RabbitMQ`);
  });

  return connection;
}

/**
 * Wait for RabbitMQ connection to be ready
 * @param {rabbit.Connection} connection
 */
async function waitForConnection(connection) {
  return new Promise((resolve) => {
    if (connection.ready) {
      resolve();
    } else {
      connection.once('connection', () => {
        resolve();
      });
    }
  });
}

module.exports = {
  createConnection,
  waitForConnection,
  RABBITMQ_URL
};
