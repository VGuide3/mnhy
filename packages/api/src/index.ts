import { PACKAGE_NAME as SHARED_PACKAGE, PRODUCT_NAME } from '@web3-forge/shared';

export const PACKAGE_NAME = '@web3-forge/api';

export const PACKAGE_DESCRIPTION = `${PRODUCT_NAME} orchestration API for projects, builds, and preview sessions.`;

export const DEPENDENCIES = [SHARED_PACKAGE] as const;
