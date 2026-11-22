import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '@web3-forge/shared';
import { runBuildCli } from './cli.js';

const EXAMPLE_PROJECT = fileURLToPath(new URL('../../../examples/simple-project', import.meta.url));

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'web3-forge-worker-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('worker CLI integration', () => {
  it('builds the example project end to end', async () => {
    const root = await makeTempDir();
    const outDir = path.join(root, 'artifacts', 'cli');
    const logsDir = path.join(root, 'build_logs');

    const result = await runBuildCli([
      '--project',
      EXAMPLE_PROJECT,
      '--out',
      outDir,
      '--logs',
      logsDir,
      '--project-id',
      'proj_cli',
      '--build-id',
      'bld_cli',
      '--webchunk-version',
      '0.1.0',
    ]);

    expect(result).not.toBeNull();
    if (!result) throw new Error('expected build result');

    expect(result.manifest).toMatchObject({
      projectId: 'proj_cli',
      buildId: 'bld_cli',
      entry: 'bundle.iife.js',
      webchunkVersion: '0.1.0',
    });

    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8')) as {
      buildId: string;
      artifacts: Array<{ path: string; sha256: string }>;
    };
    expect(manifest.buildId).toBe('bld_cli');
    expect(manifest.artifacts).toHaveLength(2);

    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(path.join(outDir, artifact.path));
      expect(sha256Hex(bytes)).toBe(artifact.sha256);
    }

    const log = await readFile(path.join(logsDir, 'bld_cli.log'), 'utf8');
    expect(log).toContain('manifest.json');
  });

  it('rejects missing required arguments', async () => {
    await expect(runBuildCli(['--project', EXAMPLE_PROJECT])).rejects.toThrow(
      '--project and --out are required',
    );
  });
});
