import { describe, expect, it } from 'vitest';
import { BuildError } from './build.js';
import { parseArgs } from './cli.js';

describe('worker CLI argument parsing', () => {
  it('parses spaced and inline values', () => {
    expect(
      parseArgs([
        '--project',
        'examples/simple-project',
        '--out=artifacts/build',
        '--project-id',
        'proj_demo',
        '--build-id=bld_demo',
      ]),
    ).toEqual({
      project: 'examples/simple-project',
      out: 'artifacts/build',
      projectId: 'proj_demo',
      buildId: 'bld_demo',
    });
  });

  it('parses help and all optional values', () => {
    expect(parseArgs(['--help', '--logs', 'build_logs', '--webchunk-version', '0.1.0'])).toEqual({
      help: true,
      logsDir: 'build_logs',
      webchunkVersion: '0.1.0',
    });
  });

  it('rejects unknown arguments and missing values', () => {
    expect(() => parseArgs(['--unknown'])).toThrow(BuildError);
    expect(() => parseArgs(['--project'])).toThrow('Missing value for --project');
  });
});
