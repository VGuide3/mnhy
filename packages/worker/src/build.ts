import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build as esbuild } from 'esbuild';
import type { BuildResult as EsbuildBuildResult, Message } from 'esbuild';
import { sha256Hex } from '@web3-forge/shared';

export interface BuildOptions {
  projectDir: string;
  outDir: string;
  projectId?: string;
  buildId?: string;
  entry?: string;
  logsDir?: string;
  webchunkVersion?: string;
}

export interface BuildArtifact {
  path: string;
  sha256: string;
}

export interface BuildManifest {
  version: '0.1';
  projectId: string;
  buildId: string;
  timestamp: string;
  artifacts: BuildArtifact[];
  entry: string;
  webchunkVersion: string;
}

export interface BuildResult {
  manifest: BuildManifest;
  outDir: string;
  logsPath: string;
}

export class BuildError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BuildError';
  }
}

const DEFAULT_ENTRY_CANDIDATES = ['src/index.ts', 'src/index.js', 'index.ts', 'index.js'] as const;
const DEFAULT_WEBCHUNK_VERSION = '0.1.0';

export async function buildProject(options: BuildOptions): Promise<BuildResult> {
  const projectDir = path.resolve(options.projectDir);
  const outDir = path.resolve(options.outDir);
  const buildId = options.buildId ?? `bld_${randomUUID()}`;
  const projectId = options.projectId ?? `proj_${sanitizeName(path.basename(projectDir))}`;
  const logsDir = path.resolve(options.logsDir ?? path.join(path.dirname(outDir), 'build_logs'));
  const logsPath = path.join(logsDir, `${sanitizeName(buildId)}.log`);
  const logger = new BuildLogger(logsPath);

  try {
    const entry = await resolveEntry(projectDir, options.entry);
    logger.info(`project=${projectId}`);
    logger.info(`build=${buildId}`);
    logger.info(`entry=${entry}`);

    await mkdir(outDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });

    const iifePath = path.join(outDir, 'bundle.iife.js');
    const esmPath = path.join(outDir, 'bundle.esm.js');

    const iifeResult = await runEsbuild(entry, projectDir, iifePath, 'iife');
    logWarnings(logger, iifeResult.warnings);
    logger.info(`wrote ${iifePath}`);

    const esmResult = await runEsbuild(entry, projectDir, esmPath, 'esm');
    logWarnings(logger, esmResult.warnings);
    logger.info(`wrote ${esmPath}`);

    const artifacts: BuildArtifact[] = [
      { path: path.basename(iifePath), sha256: await sha256File(iifePath) },
      { path: path.basename(esmPath), sha256: await sha256File(esmPath) },
    ];
    for (const artifact of artifacts) {
      logger.info(`sha256 ${artifact.path}=${artifact.sha256}`);
    }

    const manifest: BuildManifest = {
      version: '0.1',
      projectId,
      buildId,
      timestamp: new Date().toISOString(),
      artifacts,
      entry: path.basename(iifePath),
      webchunkVersion: options.webchunkVersion ?? DEFAULT_WEBCHUNK_VERSION,
    };

    const manifestPath = path.join(outDir, 'manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    logger.info(`wrote ${manifestPath}`);

    await logger.flush();
    return { manifest, outDir, logsPath };
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    if (isEsbuildFailure(error)) {
      for (const message of error.errors) logger.error(formatMessage(message));
    }
    await logger.flush();
    throw error instanceof BuildError
      ? error
      : new BuildError(error instanceof Error ? error.message : 'Build failed', { cause: error });
  }
}

async function runEsbuild(
  entry: string,
  projectDir: string,
  outfile: string,
  format: 'iife' | 'esm',
): Promise<EsbuildBuildResult> {
  return esbuild({
    entryPoints: [entry],
    outfile,
    bundle: true,
    sourcemap: true,
    platform: 'browser',
    format,
    target: 'es2020',
    logLevel: 'silent',
    absWorkingDir: projectDir,
  });
}

async function resolveEntry(projectDir: string, entry?: string): Promise<string> {
  if (entry !== undefined) {
    const resolved = path.resolve(projectDir, entry);
    if (await isFile(resolved)) return resolved;
    throw new BuildError(`Entry file not found: ${entry}`);
  }

  for (const candidate of DEFAULT_ENTRY_CANDIDATES) {
    const resolved = path.resolve(projectDir, candidate);
    if (await isFile(resolved)) return resolved;
  }

  throw new BuildError(
    `No entry file found in ${projectDir}; expected ${DEFAULT_ENTRY_CANDIDATES.join(', ')}`,
  );
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function sha256File(filePath: string): Promise<string> {
  return sha256Hex(await readFile(filePath));
}

function logWarnings(logger: BuildLogger, warnings: readonly Message[]): void {
  for (const warning of warnings) {
    logger.info(`esbuild warning: ${formatMessage(warning)}`);
  }
}

function formatMessage(message: Message): string {
  if (!message.location) return message.text;
  return `${message.location.file}:${message.location.line}:${message.location.column}: ${message.text}`;
}

function isEsbuildFailure(error: unknown): error is { errors: Message[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

class BuildLogger {
  private readonly lines: string[] = [];

  constructor(private readonly logPath: string) {}

  info(message: string): void {
    this.lines.push(`${new Date().toISOString()} INFO ${message}`);
    console.log(`[worker] ${message}`);
  }

  error(message: string): void {
    this.lines.push(`${new Date().toISOString()} ERROR ${message}`);
    console.error(`[worker] ${message}`);
  }

  async flush(): Promise<void> {
    await mkdir(path.dirname(this.logPath), { recursive: true });
    await writeFile(this.logPath, `${this.lines.join('\n')}\n`, 'utf8');
  }
}
