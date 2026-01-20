#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'E-commerce order pipeline',
  cwd: REPO_ROOT,
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
      title: 'Service - Analytics',
      command: "node standalone/consumer.js --use-case ecommerce_pipeline --service-role analytics"
    },
    {
      title: 'Producer - e-commerce pipeline',
      command: 'node standalone/producer.js --use-case ecommerce_pipeline --demo'
    }
  ]
});
