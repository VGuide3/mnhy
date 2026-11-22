import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';
import { PACKAGE_NAME as TX_ENGINE_PACKAGE } from '@web3-forge/tx-engine';

export const PACKAGE_NAME = '@web3-forge/api';

export const PACKAGE_DESCRIPTION = `${PRODUCT_NAME} Fastify orchestration API for projects, builds, and transaction operations.`;

export const DEPENDENCIES = [SHARED_PACKAGE, TX_ENGINE_PACKAGE] as const;

export * from './app.js';
