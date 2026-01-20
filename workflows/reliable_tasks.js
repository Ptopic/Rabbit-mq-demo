#!/usr/bin/env node

const { launchWorkflow, REPO_ROOT } = require('../standalone/workflowLauncher');

launchWorkflow({
  name: 'Reliable tasks - retry + DLQ',
  cwd: REPO_ROOT,
  layout: { grid: { columns: 2 } },
  windows: [
    {
      title: 'Worker - reliable tasks',
      command: "node standalone/consumer.js --use-case reliable_tasks_retry_dlq --worker 'Reliable Worker 1' --fail-rate 30 --max-retries 3 --retry-delay-ms 5000"
    },
    {
      title: 'Inspector - DLQ',
      command: 'node standalone/consumer.js --use-case reliable_tasks_retry_dlq --role dlq'
    },
    {
      title: 'Producer - reliable tasks',
      command: 'node standalone/producer.js --use-case reliable_tasks_retry_dlq --demo'
    }
  ]
});
