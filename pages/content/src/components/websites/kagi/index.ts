/**
 * Kagi Module
 *
 * This file exports all Kagi-related functionality
 */

// Import local modules to ensure TypeScript recognizes them
import './chatInputHandler';

// Export sidebar components from common
export { SidebarManager } from '@src/components/sidebar';

// Export all functions from the kagi module
export * from './chatInputHandler';
