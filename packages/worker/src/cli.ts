import path from 'node:path';
import { BuildError, buildProject } from './build.js';
import type { BuildResult } from './build.js';

export interface CliOptions {
  project?: string;
  out?: string;
  projectId?: string;
  buildId?: string;
  logsDir?: string;
  webchunkVersion?: string;
  help?: boolean;
}

const USAGE = `Usage: node dist/worker.js --project <dir> --out <dir> [options]

Options:
  --project <dir>           Project directory containing src/index.ts or src/index.js
  --out <dir>               Output directory for bundles and manifest.json
  --project-id <id>         Manifest projectId (default: proj_<folder>)
  --build-id <id>           Manifest buildId (default: bld_<uuid>)
  --logs <dir>              Build logs directory (default: <out>/../build_logs)
  --webchunk-version <ver>  Manifest webchunkVersion (default: 0.1.0)
  -h, --help                Show this help`;

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    const equalsIndex = argument.indexOf('=');
    const key = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    let value = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);

    if (value === undefined) {
      index += 1;
      value = argv[index];
    }
    if (value === undefined) {
      throw new BuildError(`Missing value for ${key}`);
    }

    switch (key) {
      case '--project':
        options.project = value;
        break;
      case '--out':
        options.out = value;
        break;
      case '--project-id':
        options.projectId = value;
        break;
      case '--build-id':
        options.buildId = value;
        break;
      case '--logs':
        options.logsDir = value;
        break;
      case '--webchunk-version':
        options.webchunkVersion = value;
        break;
      default:
        throw new BuildError(`Unknown argument: ${key}`);
    }
  }

  return options;
}

export async function runBuildCli(argv: string[]): Promise<BuildResult | null> {
  const options = parseArgs(argv);

  if (options.help) {
    console.log(USAGE);
    return null;
  }

  if (options.project === undefined || options.out === undefined) {
    console.error(USAGE);
    throw new BuildError('--project and --out are required');
  }

  const result = await buildProject({
    projectDir: options.project,
    outDir: options.out,
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    ...(options.buildId === undefined ? {} : { buildId: options.buildId }),
    ...(options.logsDir === undefined ? {} : { logsDir: options.logsDir }),
    ...(options.webchunkVersion === undefined ? {} : { webchunkVersion: options.webchunkVersion }),
  });

  console.log(`[worker] manifest: ${path.join(result.outDir, 'manifest.json')}`);
  console.log(`[worker] logs: ${result.logsPath}`);
  return result;
}
