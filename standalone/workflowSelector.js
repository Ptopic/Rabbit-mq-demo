#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');
const inquirer = require('inquirer');
const chalk = require('chalk');

const REPO_ROOT = path.resolve(__dirname, '..');

const WORKFLOWS = [
  { id: 'direct', name: 'Direct exchange - logging by level', script: 'workflows/direct_logs.js' },
  { id: 'fanout', name: 'Fanout exchange - broadcast notifications', script: 'workflows/fanout_notifications.js' },
  { id: 'topic', name: 'Topic exchange - routing by pattern', script: 'workflows/topic_events.js' },
  { id: 'work-queue', name: 'Work queue - task distribution + QoS', script: 'workflows/work_queue.js' },
  { id: 'reliable', name: 'Reliable tasks - retry + DLQ', script: 'workflows/reliable_tasks.js' },
  { id: 'ecommerce', name: 'E-commerce order pipeline', script: 'workflows/ecommerce_pipeline.js' }
];

async function selectWorkflow() {
  const { workflowId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'workflowId',
      message: 'Select a workflow to launch:',
      loop: false,
      choices: [
        ...WORKFLOWS.map((wf) => ({ name: wf.name, value: wf.id })),
        new inquirer.Separator(),
        { name: 'Kill all tmux sessions', value: 'kill' },
        new inquirer.Separator(),
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);
  return workflowId;
}

function tmuxExists() {
  const result = spawnSync('tmux', ['-V'], { stdio: 'ignore' });
  return result.status === 0;
}

function killAllTmuxSessions() {
  if (!tmuxExists()) {
    console.log(chalk.yellow('tmux is not installed or not in PATH.'));
    return;
  }

  const list = spawnSync('tmux', ['list-sessions', '-F', '#S'], { encoding: 'utf8' });
  if (list.status !== 0) {
    console.log(chalk.yellow('No tmux sessions found.'));
    return;
  }

  const sessions = String(list.stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (sessions.length === 0) {
    console.log(chalk.yellow('No tmux sessions found.'));
    return;
  }

  sessions.forEach((session) => {
    spawnSync('tmux', ['kill-session', '-t', session], { stdio: 'ignore' });
  });
  console.log(chalk.green(`Killed ${sessions.length} tmux session(s).`));
}

async function main() {
  console.log(chalk.cyan.bold('\nRabbitMQ Workflows\n'));
  while (true) {
    const selected = await selectWorkflow();
    if (selected === 'exit') return;

    if (selected === 'kill') {
      killAllTmuxSessions();
      continue;
    }

    const workflow = WORKFLOWS.find((wf) => wf.id === selected);
    if (!workflow) {
      console.log(chalk.red('Unknown workflow selection.'));
      continue;
    }

    const scriptPath = path.join(REPO_ROOT, workflow.script);
    const result = spawnSync('node', [scriptPath], { stdio: 'inherit' });
    process.exit(result.status === null ? 1 : result.status);
  }
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
