#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Fanout exchange - broadcast notifications',
  cwd: REPO_ROOT,
  windows: [
    {
      title: 'Consumer - Email worker',
      command: "node standalone/consumer.js --use-case fanout_notifications --service 'Email worker'"
    },
    {
      title: 'Consumer - SMS worker',
      command: "node standalone/consumer.js --use-case fanout_notifications --service 'SMS worker'"
    },
    {
      title: 'Consumer - Push worker',
      command: "node standalone/consumer.js --use-case fanout_notifications --service 'Push worker'"
    },
    {
      title: 'Producer - fanout notifications',
      command: 'node standalone/producer.js --use-case fanout_notifications --demo'
    }
  ]
});
