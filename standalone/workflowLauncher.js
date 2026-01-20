const { spawn, spawnSync } = require('child_process');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

function commandExists(command) {
  const result = spawnSync('which', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function escapeAppleScript(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeBash(value) {
  return String(value).replace(/"/g, '\\"');
}

function buildShellCommand(command, cwd) {
  const workingDir = cwd || REPO_ROOT;
  return `cd "${escapeBash(workingDir)}" && ${command}`;
}

function openTerminalWindow({ title, command, cwd }) {
  const workingDir = cwd || REPO_ROOT;
  const platform = process.platform;

  if (platform === 'darwin') {
    const script = `tell application "Terminal"
  activate
  do script "${escapeAppleScript(buildShellCommand(command, workingDir))}"
end tell`;

    const child = spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true });
    child.unref();
    return;
  }

  if (platform === 'win32') {
    const titleArg = title ? `"${title}"` : '"RabbitMQ Demo"';
    const cmd = `start ${titleArg} cmd /k "cd /d ${workingDir} && ${command}"`;
    const child = spawn('cmd.exe', ['/c', cmd], { stdio: 'ignore', detached: true, shell: true });
    child.unref();
    return;
  }

  const terminalMap = [
    {
      name: 'gnome-terminal',
      command: (cmd) => ['--title', title || 'RabbitMQ Demo', '--', 'bash', '-lc', cmd]
    },
    {
      name: 'konsole',
      command: (cmd) => ['--noclose', '-p', `tabtitle=${title || 'RabbitMQ Demo'}`, '-e', 'bash', '-lc', cmd]
    },
    {
      name: 'x-terminal-emulator',
      command: (cmd) => ['-T', title || 'RabbitMQ Demo', '-e', 'bash', '-lc', cmd]
    },
    {
      name: 'xterm',
      command: (cmd) => ['-T', title || 'RabbitMQ Demo', '-e', 'bash', '-lc', cmd]
    }
  ];

  const terminal = terminalMap.find((entry) => commandExists(entry.name));
  if (!terminal) {
    console.error('No supported terminal emulator found. Please run the commands manually.');
    console.error(`Command: ${command}`);
    return;
  }

  const shellCommand = `${buildShellCommand(command, workingDir)}; exec bash`;
  const child = spawn(terminal.name, terminal.command(shellCommand), { stdio: 'ignore', detached: true });
  child.unref();
}

function launchWorkflow({ name, windows, cwd }) {
  console.log(`Launching workflow: ${name}`);
  windows.forEach((win, index) => {
    const title = win.title || `${name} (${index + 1})`;
    openTerminalWindow({ title, command: win.command, cwd });
  });
}

module.exports = { launchWorkflow, REPO_ROOT };
