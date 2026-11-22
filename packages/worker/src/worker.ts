#!/usr/bin/env node
import { runBuildCli } from './cli.js';

runBuildCli(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`[worker] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
