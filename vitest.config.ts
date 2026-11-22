import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspacePackages = ['shared', 'tx-engine', 'runtime', 'api', 'worker', 'web'] as const;

const alias = Object.fromEntries(
  workspacePackages.map((name) => [
    `@web3-forge/${name}`,
    fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
  ]),
);

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    restoreMocks: true,
  },
});
