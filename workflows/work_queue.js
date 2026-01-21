#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Work queue - task distribution',
  cwd: REPO_ROOT,
  layout: { tmux: { session: 'rabbitmq-demo' }, grid: { columns: 2 } },
  windows: [
    {
      title: 'Worker - queue (Worker 1)',
      command: "node standalone/consumer.js --use-case work_queue --worker 'Worker 1' --prefetch 5 --concurrency 5"
    },
    {
      title: 'Worker - queue (Worker 2)',
      command: "node standalone/consumer.js --use-case work_queue --worker 'Worker 2' --prefetch 1 --concurrency 1"
    },
    {
      title: 'Producer - work queue',
      command: 'sleep 5 && node standalone/producer.js --use-case work_queue --demo --batch-count 10 --interval-ms 10000'
    }
  ]
});
