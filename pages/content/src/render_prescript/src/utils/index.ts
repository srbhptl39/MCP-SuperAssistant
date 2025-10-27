// Re-export all utility functions
import { createLogger } from '@extension/shared/lib/logger';

const logger = createLogger('RenderPrescriptUtils');

export * from './dom';
export * from './performance';
export * from './themeDetector';

// Add a global utility for theme control that can be accessed from the console
if (typeof window !== 'undefined') {
  (window as any).themeControl = {
    forceLight: () => {
      const { forceThemeMode, clearCachedTheme } = require('./themeDetector');
      forceThemeMode('light');
      logger.debug('Forced light theme. Refresh the page to see changes.');
    },
    forceDark: () => {
      const { forceThemeMode, clearCachedTheme } = require('./themeDetector');
      forceThemeMode('dark');
      logger.debug('Forced dark theme. Refresh the page to see changes.');
    },
    useSystem: () => {
      const { forceThemeMode, clearCachedTheme } = require('./themeDetector');
      forceThemeMode('system');
      logger.debug('Using system theme preference. Refresh the page to see changes.');
    },
    reset: () => {
      const { clearCachedTheme } = require('./themeDetector');
      clearCachedTheme();
      logger.debug('Theme detection reset. Refresh the page to see changes.');
    },
    detect: () => {
      const { detectHostTheme, isDarkTheme } = require('./themeDetector');
      const theme = detectHostTheme();
      const isDark = isDarkTheme();
      logger.debug(`Detected theme: ${theme}`);
      logger.debug(`Using ${isDark ? 'dark' : 'light'} theme`);
      return { theme, isDark };
    },
  };

  logger.debug('[Theme Detector] Global theme control available via window.themeControl');
}
