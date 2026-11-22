import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/worker';

export const PACKAGE_DESCRIPTION = `${PRODUCT_NAME} build worker for esbuild artifacts and signed manifests.`;

export const DEPENDENCIES = [SHARED_PACKAGE] as const;
