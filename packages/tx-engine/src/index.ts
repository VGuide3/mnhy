import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/tx-engine';

export const PACKAGE_DESCRIPTION = `Canonical transaction engine and strategies for ${PRODUCT_NAME}.`;

export const DEPENDENCIES = [SHARED_PACKAGE] as const;
