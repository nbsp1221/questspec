#!/usr/bin/env node

import { createCli } from './cli.ts';

try {
  createCli().parse();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
