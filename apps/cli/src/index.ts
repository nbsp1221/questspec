#!/usr/bin/env node

import { createCli } from './cli.ts';

try {
  const cli = createCli();
  cli.parse(process.argv, { run: false });
  await cli.runMatchedCommand();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
