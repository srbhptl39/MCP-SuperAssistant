/**
 * Gemini Module
 *
 * This file exports all Gemini-related functionality
 */

import { logMessage } from '@src/utils/helpers';

export * from './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// The line below was a duplicate and has been removed.
// export * from './chatInputHandler';
