#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Direct exchange - logging by level',
  cwd: REPO_ROOT,
  windows: [
    {
      title: 'Consumer - direct logs (info)',
      command: "node standalone/consumer.js --use-case direct_logs --routing-key info"
    },
    {
      title: 'Consumer - direct logs (error)',
      command: "node standalone/consumer.js --use-case direct_logs --routing-key error"
    },
    {
      title: 'Producer - direct logs',
      command: 'node standalone/producer.js --use-case direct_logs --demo'
    }
  ]
});
