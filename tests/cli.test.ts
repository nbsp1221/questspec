import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };

const cliEntry = fileURLToPath(new URL('../src/index.ts', import.meta.url));

function runCli(args: string[]): { stderr: string; stdout: string; status: number } {
  const result = spawnSync(process.execPath, [cliEntry, ...args], { encoding: 'utf8' });

  return {
    stderr: result.stderr.trim(),
    stdout: result.stdout.trim(),
    status: result.status ?? -1,
  };
}

describe('questspec CLI', () => {
  it('prints usage and exits successfully', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`questspec/${pkg.version}`);
    expect(result.stdout).toContain('Usage:');
  });

  it('prints its version', () => {
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(new RegExp(`^questspec/${pkg.version.replaceAll('.', '\\.')} `));
  });

  it('fails on an unknown option', () => {
    const result = runCli(['--unknown']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown option');
  });

  it('fails on an unknown command', () => {
    const result = runCli(['compile']);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown command 'compile'");
  });
});
