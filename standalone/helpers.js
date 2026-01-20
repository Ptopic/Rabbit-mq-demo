async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function clearScreen() {
  // Clear terminal in a robust way (works in most terminals, including Cursor).
  // - ESC[2J: clear screen
  // - ESC[3J: clear scrollback (supported by many terminals)
  // - ESC[H : move cursor to 0,0
  // console.clear(): Node fallback
  try {
    if (process.stdout && process.stdout.isTTY) {
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    }
  } catch (e) {
    // ignore
  }

  try {
    console.clear();
  } catch (e) {
    // ignore
  }

  // Fallback if the terminal ignores ANSI/console.clear
  try {
    if (process.stdout && process.stdout.isTTY) {
      process.stdout.write('\n'.repeat(50));
    }
  } catch (e) {
    // ignore
  }
}

function printUseCaseIntro(chalk, useCase) {
  console.log(chalk.cyan('\nSelected use case: ') + chalk.white(useCase.name));
  console.log(chalk.gray('\nWhat this represents:'));
  for (const line of useCase.represents) console.log(chalk.gray(`- ${line}`));
  console.log(chalk.gray('\nConsumers to run for testing:'));
  for (const line of useCase.consumersToRun) console.log(chalk.gray(`- ${line}`));
  console.log();
}

module.exports = { sleep, clearScreen, printUseCaseIntro };

