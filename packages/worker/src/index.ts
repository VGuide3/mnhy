import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/worker';

export const PACKAGE_DESCRIPTION = `${PRODUCT_NAME} build worker for esbuild artifacts and integrity manifests.`;

export const DEPENDENCIES = [SHARED_PACKAGE] as const;

export * from './build.js';
export * from './cli.js';
