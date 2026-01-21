#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Reliable tasks - retry + DLQ',
  cwd: REPO_ROOT,
  layout: { tmux: { session: 'rabbitmq-demo' }, grid: { columns: 2 } },
  windows: [
    {
      title: 'Worker - reliable tasks (50% fail)',
      command: "node standalone/consumer.js --use-case reliable_tasks_retry_dlq --worker 'Reliable Worker 1' --fail-rate 80 --max-retries 3 --retry-delay-ms 0"
    },
    {
      title: 'Worker - reliable tasks (100% fail)',
      command: "node standalone/consumer.js --use-case reliable_tasks_retry_dlq --worker 'Reliable Worker 2' --fail-rate 100 --max-retries 0 --retry-delay-ms 0"
    },
    {
      title: 'Inspector - DLQ',
      command: 'node standalone/consumer.js --use-case reliable_tasks_retry_dlq --role dlq'
    },
    {
      title: 'Producer - reliable tasks',
      command: 'node standalone/producer.js --use-case reliable_tasks_retry_dlq --demo --interval-ms 3000 --duration-ms 1000'
    }
  ]
});
