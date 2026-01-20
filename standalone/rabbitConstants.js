module.exports = {
  directLogs: {
    exchange: 'logs_direct',
    type: 'direct'
  },
  fanoutNotifications: {
    exchange: 'notifications_fanout',
    type: 'fanout'
  },
  topicEvents: {
    exchange: 'events_topic',
    type: 'topic'
  },
  workQueue: {
    queue: 'tasks',
    defaultPrefetch: 1
  },
  reliableTasks: {
    exchange: 'demo.reliable.tasks',
    exchangeType: 'direct',
    dlxExchange: 'demo.reliable.dlx',
    dlxType: 'direct',
    mainQueue: 'demo.reliable.tasks.queue',
    retryQueue: 'demo.reliable.tasks.retry',
    dlqQueue: 'demo.reliable.tasks.dlq',
    mainKey: 'tasks.process',
    retryKey: 'tasks.retry',
    failedKey: 'tasks.failed'
  },
  ecommerce: {
    exchange: 'demo.ecommerce.events',
    exchangeType: 'topic',
    queues: {
      payment: 'demo.ecommerce.payment',
      inventory: 'demo.ecommerce.inventory',
      notifications: 'demo.ecommerce.notifications',
      analytics: 'demo.ecommerce.analytics'
    }
  }
};

