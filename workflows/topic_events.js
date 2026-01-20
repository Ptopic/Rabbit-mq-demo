#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Topic exchange - routing by pattern',
  cwd: REPO_ROOT,
  layout: { grid: { columns: 2 } },
  windows: [
    {
      title: 'Consumer - topic (user.#)',
      command: "node standalone/consumer.js --use-case topic_events --pattern 'user.#'"
    },
    {
      title: 'Consumer - topic (order.*.critical)',
      command: "node standalone/consumer.js --use-case topic_events --pattern 'order.*.critical'"
    },
    {
      title: 'Consumer - topic (*.*.updated)',
      command: "node standalone/consumer.js --use-case topic_events --pattern '*.*.updated'"
    },
    {
      title: 'Producer - topic events',
      command: 'node standalone/producer.js --use-case topic_events --demo'
    }
  ]
});
