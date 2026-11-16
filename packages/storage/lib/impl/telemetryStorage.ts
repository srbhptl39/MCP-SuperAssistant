import type { BaseStorage } from '../base/index.js';
import { createStorage, StorageEnum } from '../base/index.js';

/** "Usage statistics" opt-out (Settings). On by default; the background checks it before every send. */
export const telemetryStorage: BaseStorage<{ enabled: boolean }> = createStorage<{ enabled: boolean }>(
  'telemetry-settings',
  { enabled: true },
  { storageEnum: StorageEnum.Local, liveUpdate: true },
);
