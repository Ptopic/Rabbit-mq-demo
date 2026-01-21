#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'E-commerce order pipeline',
  cwd: REPO_ROOT,
  layout: { tmux: { session: 'rabbitmq-demo' }, grid: { columns: 2 } },
  windows: [
    {
      title: 'Service - Payment',
      command: "node standalone/consumer.js --use-case ecommerce_pipeline --service-role payment"
    },
    {
      title: 'Service - Inventory',
      command: "node standalone/consumer.js --use-case ecommerce_pipeline --service-role inventory"
    },
    {
      title: 'Service - Notifications',
      command: "node standalone/consumer.js --use-case ecommerce_pipeline --service-role notifications"
    },
    {
      title: 'Producer - e-commerce pipeline',
      command: 'sleep 5 && node standalone/producer.js --use-case ecommerce_pipeline --demo --interval-ms 20000 --demo-count 2 --demo-scenarios success,payment_failed'
    }
  ]
});
