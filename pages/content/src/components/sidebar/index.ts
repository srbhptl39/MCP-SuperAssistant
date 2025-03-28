/**
 * Common Sidebar Components
 *
 * This file exports common sidebar components and utilities that can be used
 * by both ChatGPT and Perplexity implementations.
 */

import { SidebarManager } from './SidebarManager';
import { BaseSidebarManager } from './base/BaseSidebarManager';
import type { SiteType, ToolOutputHandler } from './base/BaseSidebarManager';

// Export components and utilities
export { BaseSidebarManager, SidebarManager };

// Export types
export type { SiteType, ToolOutputHandler };
