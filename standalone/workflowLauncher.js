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

function getScreenBounds() {
  if (process.platform === 'darwin') {
    const result = spawnSync('osascript', ['-e', 'tell application "Finder" to get bounds of window of desktop'], {
      encoding: 'utf8'
    });
    if (result.status === 0) {
      const parts = String(result.stdout)
        .trim()
        .split(',')
        .map((value) => Number(value.trim()));
      if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
        const [x, y, right, bottom] = parts;
        return { x, y, width: right - x, height: bottom - y };
      }
    }
  }

  if (process.platform !== 'win32' && commandExists('xdpyinfo')) {
    const result = spawnSync('xdpyinfo', [], { encoding: 'utf8' });
    const match = result.stdout && result.stdout.match(/dimensions:\s+(\d+)x(\d+)/);
    if (match) {
      return { x: 0, y: 0, width: Number(match[1]), height: Number(match[2]) };
    }
  }

  return { x: 0, y: 0, width: 1440, height: 900 };
}

function normalizeGridConfig(grid, totalWindows) {
  if (!grid) return null;
  const columns = Math.max(1, Number(grid.columns || grid.cols || 2));
  const rows = Math.max(1, Number(grid.rows || Math.ceil(totalWindows / columns)));
  const gap = Number.isFinite(Number(grid.gap)) ? Number(grid.gap) : 20;
  return { columns, rows, gap };
}

function calculateGridBounds(index, totalWindows, gridConfig, screenBounds) {
  if (!gridConfig) return null;
  const { columns, rows, gap } = gridConfig;
  const col = index % columns;
  const row = Math.floor(index / columns);
  if (row >= rows) return null;

  const totalGapX = gap * (columns + 1);
  const totalGapY = gap * (rows + 1);
  const cellWidth = Math.floor((screenBounds.width - totalGapX) / columns);
  const cellHeight = Math.floor((screenBounds.height - totalGapY) / rows);
  const x = screenBounds.x + gap + col * (cellWidth + gap);
  const y = screenBounds.y + gap + row * (cellHeight + gap);

  return { x, y, width: cellWidth, height: cellHeight };
}

function openTerminalWindow({ title, command, cwd, bounds }) {
  const workingDir = cwd || REPO_ROOT;
  const platform = process.platform;

  if (platform === 'darwin') {
    const boundsScript = bounds
      ? `\n  set bounds of front window to {${bounds.x}, ${bounds.y}, ${bounds.x + bounds.width}, ${bounds.y + bounds.height}}`
      : '';
    const script = `tell application "Terminal"
  activate
  do script "${escapeAppleScript(buildShellCommand(command, workingDir))}"${boundsScript}
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

  const geometry = bounds ? `${Math.max(80, Math.floor(bounds.width / 8))}x${Math.max(24, Math.floor(bounds.height / 18))}+${bounds.x}+${bounds.y}` : null;
  const terminalMap = [
    {
      name: 'gnome-terminal',
      command: (cmd) => [
        '--title',
        title || 'RabbitMQ Demo',
        ...(geometry ? ['--geometry', geometry] : []),
        '--',
        'bash',
        '-lc',
        cmd
      ]
    },
    {
      name: 'konsole',
      command: (cmd) => [
        '--noclose',
        '-p',
        `tabtitle=${title || 'RabbitMQ Demo'}`,
        ...(geometry ? ['--geometry', geometry] : []),
        '-e',
        'bash',
        '-lc',
        cmd
      ]
    },
    {
      name: 'x-terminal-emulator',
      command: (cmd) => ['-T', title || 'RabbitMQ Demo', ...(geometry ? ['--geometry', geometry] : []), '-e', 'bash', '-lc', cmd]
    },
    {
      name: 'xterm',
      command: (cmd) => ['-T', title || 'RabbitMQ Demo', ...(geometry ? ['-geometry', geometry] : []), '-e', 'bash', '-lc', cmd]
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

  if (bounds && process.platform !== 'win32' && commandExists('wmctrl')) {
    const moveCommand = `sleep 0.2; wmctrl -r :ACTIVE: -e 0,${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
    const mover = spawn('bash', ['-lc', moveCommand], { stdio: 'ignore', detached: true });
    mover.unref();
  }
}

function launchWorkflow({ name, windows, cwd, layout }) {
  console.log(`Launching workflow: ${name}`);
  const gridConfig = normalizeGridConfig(layout && layout.grid, windows.length);
  const screenBounds = gridConfig ? getScreenBounds() : null;
  windows.forEach((win, index) => {
    const title = win.title || `${name} (${index + 1})`;
    const bounds = gridConfig ? calculateGridBounds(index, windows.length, gridConfig, screenBounds) : null;
    openTerminalWindow({ title, command: win.command, cwd, bounds });
  });
}

module.exports = { launchWorkflow, REPO_ROOT };
