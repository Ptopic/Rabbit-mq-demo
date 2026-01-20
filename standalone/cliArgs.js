function toCamel(text) {
  return text.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function parseArgs(argv = process.argv.slice(2)) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = toCamel(token.slice(2));
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function getNumber(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = { parseArgs, getNumber };
