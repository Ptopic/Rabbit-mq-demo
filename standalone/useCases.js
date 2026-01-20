const USE_CASES = [
  {
    id: 'direct_logs',
    name: 'Direct exchange - logging by level',
    represents: [
      'Exact routing key match (direct exchange).',
      'Real world: log routing where info/warning/error go to different consumers.'
    ],
    consumersToRun: [
      'consumer: Direct logs -> level=info',
      'consumer: Direct logs -> level=error'
    ]
  },
  {
    id: 'fanout_notifications',
    name: 'Fanout exchange - broadcast notifications',
    represents: [
      'Broadcast the same event to all subscribers (fanout exchange).',
      'Real world: email + sms + push all need the same notification event.'
    ],
    consumersToRun: [
      'consumer: Fanout notifications -> service=Email worker',
      'consumer: Fanout notifications -> service=SMS worker',
      'consumer: Fanout notifications -> service=Push worker'
    ]
  },
  {
    id: 'topic_events',
    name: 'Topic exchange - routing by pattern',
    represents: [
      'Wildcard routing with patterns (* and #) using topic exchange.',
      'Real world: microservices subscribe to specific event categories.'
    ],
    consumersToRun: [
      'consumer: Topic events -> pattern=user.#',
      'consumer: Topic events -> pattern=order.*.critical',
      'consumer: Topic events -> pattern=*.*.updated'
    ]
  },
  {
    id: 'work_queue',
    name: 'Work queue - task distribution + QoS',
    represents: [
      'Multiple workers compete for tasks; each task processed by exactly one worker.',
      'Demonstrates QoS prefetch for fair dispatch (section 5).'
    ],
    consumersToRun: [
      'consumer: Work queue worker -> Worker 1',
      'consumer: Work queue worker -> Worker 2'
    ]
  },
  {
    id: 'reliable_tasks_retry_dlq',
    name: 'Reliable tasks - manual ACK + retry + DLQ',
    represents: [
      'Manual ack/nack, delayed retry using TTL retry queue, and DLQ for permanent failures.',
      'Real world: background job processing where failures need triage and safe retries.'
    ],
    consumersToRun: [
      'consumer: Reliable tasks -> role=Main worker',
      'consumer: Reliable tasks -> role=DLQ inspector'
    ]
  },
  {
    id: 'ecommerce_pipeline',
    name: 'E-commerce order pipeline',
    represents: [
      'Multiple independent services react to events in parallel (payment, inventory, notifications, analytics).',
      'Demonstrates resilience: services can be offline and process later from queues.'
    ],
    consumersToRun: [
      'consumer: E-commerce service -> Payment service',
      'consumer: E-commerce service -> Inventory service',
      'consumer: E-commerce service -> Notification service',
      'consumer: E-commerce service -> Analytics service'
    ]
  }
];

module.exports = { USE_CASES };

