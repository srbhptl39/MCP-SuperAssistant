/**
 * DeepSeek Module
 *
 * This file exports all DeepSeek-related functionality
 */

// Import local modules to ensure TypeScript recognizes them
import './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';


// Export all functions from the deepseek module
export * from './chatInputHandler';
