/**
 * T3 Chat Module
 *
 * This file exports all T3 Chat-related functionality
 */

// Import local modules to ensure TypeScript recognizes them
import './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export all functions from the t3chat module
export * from './chatInputHandler';
