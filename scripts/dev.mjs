import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tscBin = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

const services = [
  { label: 'api', entry: 'packages/api/dist/server.js' },
  { label: 'web', entry: 'packages/web/dist/server.js' },
  { label: 'worker', entry: 'packages/worker/dist/server.js' },
];

const children = [];

function start(label, command, args) {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', (error) => {
    console.error(`[dev] failed to start ${label}:`, error);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code !== 0) {
      console.error(`[dev] ${label} exited with code ${code}`);
      process.exitCode = code;
    }
  });
  children.push(child);
}

start('tsc', process.execPath, [tscBin, '-b', '--watch', '--preserveWatchOutput']);

for (const service of services) {
  start(service.label, process.execPath, ['--watch', service.entry]);
}

function shutdown(signal) {
  for (const child of children) child.kill(signal);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
