import {createRequire} from 'node:module';
import type {Page} from '@playwright/test';
export const scanFromUi: (page:Page)=>Promise<void>=createRequire(import.meta.url)('../../scripts/verify-scan-ui.cjs');
