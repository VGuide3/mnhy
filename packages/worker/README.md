# @web3-forge/worker

esbuild build worker POC. It bundles a small project into an IIFE and an ESM artifact with source
maps, hashes both bundles with SHA-256, writes a manifest, and records build logs.

## Build the example

```bash
pnpm build
pnpm worker:example
```

Or run the CLI directly from the repository root:

```bash
node packages/worker/dist/worker.js \
  --project examples/simple-project \
  --out artifacts/simple-project
```

The CLI writes:

```text
artifacts/simple-project/
  bundle.iife.js
  bundle.iife.js.map
  bundle.esm.js
  bundle.esm.js.map
  manifest.json
artifacts/build_logs/
  bld_<uuid>.log
```

Use `--logs <dir>` to change the log directory, `--project-id` and `--build-id` to set manifest
IDs, and `--webchunk-version` to set the manifest version.

## CLI options

```text
Usage: node dist/worker.js --project <dir> --out <dir> [options]

Options:
  --project <dir>           Project directory containing src/index.ts or src/index.js
  --out <dir>               Output directory for bundles and manifest.json
  --project-id <id>         Manifest projectId (default: proj_<folder>)
  --build-id <id>           Manifest buildId (default: bld_<uuid>)
  --logs <dir>              Build logs directory (default: <out>/../build_logs)
  --webchunk-version <ver>  Manifest webchunkVersion (default: 0.1.0)
  -h, --help                Show this help
```

The entry file is `src/index.ts`, `src/index.js`, `index.ts`, or `index.js` by default. Pass an
explicit path relative to the project directory when needed.

## Manifest

```json
{
  "version": "0.1",
  "projectId": "proj_simple-project",
  "buildId": "bld_...",
  "timestamp": "2026-11-22T00:00:00.000Z",
  "artifacts": [
    { "path": "bundle.iife.js", "sha256": "..." },
    { "path": "bundle.esm.js", "sha256": "..." }
  ],
  "entry": "bundle.iife.js",
  "webchunkVersion": "0.1.0"
}
```

`entry` is the IIFE bundle. The manifest contains the fields requested for this POC; signing and
`signedBy`/`signature` fields are not implemented yet.

## Build flags

Both bundles use the same esbuild settings:

- `bundle: true`
- `platform: "browser"`
- `target: "es2020"`
- `sourcemap: true`
- `format: "iife"` or `"esm"`
- `logLevel: "silent"`, with warnings and errors written to the build log

Deterministic output is not required at this step. Flags are kept consistent between the two
outputs.

## Logs

Build progress, esbuild warnings, checksums, and output paths are printed to the console and
written to `<logs>/<buildId>.log`.

## Tests

From the repository root:

```bash
pnpm test
pnpm typecheck
```

- `src/build.test.ts` checks bundle and source-map creation, manifest contents, SHA-256 integrity,
  log output, custom entries, and missing-entry errors.
- `src/cli.test.ts` checks argument parsing.
- `src/worker.integration.test.ts` runs the CLI flow against `examples/simple-project` and verifies
  the on-disk manifest and checksums.

## POC limits

- Artifacts are written to the local filesystem. MinIO/S3 upload and manifest signing are not
  implemented in this step.
- The worker does not consume the API's in-memory build queue yet. It is a CLI-driven POC.
- Builds are not sandboxed and are intended for trusted sample projects only.
