# Simple project

Minimal browser fixture used by the build worker POC. The entry point is `src/index.ts`; it
imports `src/greeting.ts` so the bundles contain more than one module.

```bash
pnpm build
pnpm worker:example
```

The worker writes bundles, source maps, `manifest.json`, and build logs under `artifacts/`.
