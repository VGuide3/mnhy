import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '@web3-forge/shared';
import { BuildError, buildProject } from './build.js';

const EXAMPLE_PROJECT = fileURLToPath(new URL('../../../examples/simple-project', import.meta.url));

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'web3-forge-worker-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildProject', () => {
  it('bundles the example project and writes a manifest with matching checksums', async () => {
    const root = await makeTempDir();
    const outDir = path.join(root, 'artifacts', 'build_test');
    const logsDir = path.join(root, 'build_logs');

    const result = await buildProject({
      projectDir: EXAMPLE_PROJECT,
      outDir,
      logsDir,
      projectId: 'proj_test',
      buildId: 'bld_test',
      webchunkVersion: '0.1.0',
    });

    expect(result.manifest).toMatchObject({
      version: '0.1',
      projectId: 'proj_test',
      buildId: 'bld_test',
      entry: 'bundle.iife.js',
      webchunkVersion: '0.1.0',
    });
    expect(result.manifest.artifacts).toHaveLength(2);

    const manifestOnDisk = JSON.parse(
      await readFile(path.join(outDir, 'manifest.json'), 'utf8'),
    ) as typeof result.manifest;
    expect(manifestOnDisk).toEqual(result.manifest);

    for (const artifact of manifestOnDisk.artifacts) {
      const bytes = await readFile(path.join(outDir, artifact.path));
      expect(sha256Hex(bytes)).toBe(artifact.sha256);
    }

    for (const file of [
      'bundle.iife.js',
      'bundle.iife.js.map',
      'bundle.esm.js',
      'bundle.esm.js.map',
      'manifest.json',
    ]) {
      expect((await stat(path.join(outDir, file))).isFile()).toBe(true);
    }

    const log = await readFile(path.join(logsDir, 'bld_test.log'), 'utf8');
    expect(log).toContain('bundle.iife.js');
    expect(log).toContain('bundle.esm.js');
    expect(log).toContain('sha256');
  });

  it('honors a custom entry path', async () => {
    const root = await makeTempDir();
    const projectDir = path.join(root, 'project');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'main.ts'), 'export const answer = 42;\n', 'utf8');

    const result = await buildProject({
      projectDir,
      outDir: path.join(root, 'out'),
      entry: 'main.ts',
      projectId: 'proj_custom',
      buildId: 'bld_custom',
    });

    expect(result.manifest.buildId).toBe('bld_custom');
    expect((await stat(path.join(root, 'out', 'bundle.iife.js'))).isFile()).toBe(true);
  });

  it('fails when the project has no entry file', async () => {
    const root = await makeTempDir();
    const projectDir = path.join(root, 'empty');
    await mkdir(projectDir, { recursive: true });

    await expect(
      buildProject({
        projectDir,
        outDir: path.join(root, 'out'),
        logsDir: path.join(root, 'logs'),
      }),
    ).rejects.toBeInstanceOf(BuildError);
  });

  it('fails when a custom entry does not exist', async () => {
    const root = await makeTempDir();
    const projectDir = path.join(root, 'project');
    await mkdir(projectDir, { recursive: true });

    await expect(
      buildProject({
        projectDir,
        outDir: path.join(root, 'out'),
        logsDir: path.join(root, 'logs'),
        entry: 'missing.ts',
      }),
    ).rejects.toThrow('Entry file not found: missing.ts');
  });
});
