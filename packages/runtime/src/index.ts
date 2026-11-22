import { PACKAGE_NAME as TX_ENGINE_PACKAGE } from '@web3-forge/tx-engine';
import { PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/runtime';

export const PACKAGE_DESCRIPTION = `WebChunk runtime shared by ${PRODUCT_NAME} previews and exported artifacts.`;

export const DEPENDENCIES = [TX_ENGINE_PACKAGE] as const;
