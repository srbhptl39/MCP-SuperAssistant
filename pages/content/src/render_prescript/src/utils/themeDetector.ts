/**
 * Utility functions for detecting the host website's theme
 */

import { CONFIG } from '../core/config';
import { renderedFunctionBlocks } from '../renderer/functionBlock';
import { createLogger } from '@extension/shared/lib/logger';

/**
 * Theme detection result
 */

const logger = createLogger('ThemeDetector');

export type ThemeMode = 'light' | 'dark' | 'system';

// Store the detected theme to avoid recalculating
let cachedTheme: ThemeMode | null = null;

// Store the current theme state for comparison
let currentThemeState = {
  bodyClasses: '',
  htmlClasses: '',
  bodyDataTheme: '',
  htmlDataTheme: '',
  bodyBgColor: '',
  isDark: false,
};

// Callback registry for theme change listeners
type ThemeChangeCallback = (isDark: boolean) => void;
const themeChangeListeners: ThemeChangeCallback[] = [];

// Theme observer instance
let themeObserver: MutationObserver | null = null;

// Theme change detection delay (to avoid excessive updates)
const THEME_CHANGE_DELAY = 100; // ms

/**
 * Logs theme detection information if debug is enabled
 * @param message The message to log
 * @param data Optional data to include in the log
 */
function logThemeDetection(message: string, data?: any): void {
  if (CONFIG.debug) {
    logger.debug(`${message}`, data || '');
  }
}

/**
 * Enhanced theme detection with scoring mechanism
 * @returns Object with theme confidence scores
 */
function detectThemeWithScoring(): { theme: ThemeMode; confidence: number; scores: { dark: number; light: number } } {
  let darkScore = 0;
  let lightScore = 0;

  // Weight factors for different detection methods
  const weights = {
    classNames: 8,
    dataAttributes: 8,
    metaTags: 6,
    backgroundColors: 5,
    cssVariables: 4,
    textColors: 3,
    systemColors: 2,
    urlPatterns: 1,
  };

  try {
    const bodyEl = document.body;
    const htmlEl = document.documentElement;

    if (!bodyEl || !htmlEl) {
      return { theme: 'system', confidence: 0, scores: { dark: 0, light: 0 } };
    }

    // 1. Enhanced class name detection
    const bodyClasses = bodyEl.className.toLowerCase() || '';
    const htmlClasses = htmlEl.className.toLowerCase() || '';
    const allClasses = bodyClasses + ' ' + htmlClasses;

    const darkClassPatterns = [
      'dark-theme',
      'theme-dark',
      'dark-mode',
      'dark',
      'night-mode',
      'nightmode',
      'black-theme',
      'theme-black',
      'noir',
      'midnight',
      'shadow',
      'carbon',
      'slate',
      'charcoal',
      'obsidian',
      'dim',
      'dusky',
      'darker',
      'darkened',
      'invert',
      'inverted',
      'contrast-dark',
      'scheme-dark',
      'color-scheme-dark',
      'theme-dark-mode',
      'darktheme',
      'dark_theme',
      'dark_mode',
    ];

    const lightClassPatterns = [
      'light-theme',
      'theme-light',
      'light-mode',
      'light',
      'day-mode',
      'daymode',
      'white-theme',
      'theme-white',
      'bright',
      'default-theme',
      'normal',
      'classic',
      'standard',
      'vanilla',
      'clean',
      'minimal',
      'bright-mode',
      'contrast-light',
      'scheme-light',
      'color-scheme-light',
      'theme-light-mode',
      'lighttheme',
      'light_theme',
      'light_mode',
    ];

    const darkClassMatches = darkClassPatterns.filter(pattern => new RegExp(`\\b${pattern}\\b`, 'i').test(allClasses));
    const lightClassMatches = lightClassPatterns.filter(pattern =>
      new RegExp(`\\b${pattern}\\b`, 'i').test(allClasses),
    );

    if (darkClassMatches.length > 0) {
      darkScore += weights.classNames * darkClassMatches.length;
      logThemeDetection('Dark class patterns found', darkClassMatches);
    }
    if (lightClassMatches.length > 0) {
      lightScore += weights.classNames * lightClassMatches.length;
      logThemeDetection('Light class patterns found', lightClassMatches);
    }

    // 2. Data attributes detection
    const themeDataAttrs = [
      bodyEl.getAttribute('data-theme'),
      htmlEl.getAttribute('data-theme'),
      bodyEl.getAttribute('data-color-scheme'),
      htmlEl.getAttribute('data-color-scheme'),
      bodyEl.getAttribute('data-color-mode'),
      htmlEl.getAttribute('data-color-mode'),
      bodyEl.getAttribute('data-bs-theme'), // Bootstrap theme
      htmlEl.getAttribute('data-bs-theme'),
    ].filter(Boolean);

    themeDataAttrs.forEach(attr => {
      const attrValue = attr?.toLowerCase();
      if (attrValue?.includes('dark')) darkScore += weights.dataAttributes;
      if (attrValue?.includes('light')) lightScore += weights.dataAttributes;
    });

    // 3. Meta tags detection
    const metaTags = document.querySelectorAll('meta[name*="theme"], meta[name*="color-scheme"]');
    metaTags.forEach(meta => {
      const content = meta.getAttribute('content')?.toLowerCase();
      if (content?.includes('dark')) darkScore += weights.metaTags;
      if (content?.includes('light')) lightScore += weights.metaTags;
    });

    // 4. Enhanced background color analysis
    const elementsToAnalyze = [
      bodyEl,
      htmlEl,
      ...Array.from(document.querySelectorAll('main, [role="main"], .main-content, #main, #content, .content')).slice(
        0,
        3,
      ),
      ...Array.from(document.querySelectorAll('.app, #app, .wrapper, .container, .page, .layout')).slice(0, 3),
      ...Array.from(document.querySelectorAll('header, nav, .header, .navbar')).slice(0, 2),
    ];

    const backgroundAnalysis = { darkCount: 0, lightCount: 0, totalAnalyzed: 0 };

    for (const element of elementsToAnalyze) {
      if (!element) continue;

      try {
        const style = window.getComputedStyle(element);
        const bgColor = style.backgroundColor;

        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          const brightness = getColorBrightness(bgColor);
          if (brightness !== null) {
            backgroundAnalysis.totalAnalyzed++;
            if (brightness < 120) {
              backgroundAnalysis.darkCount++;
            } else if (brightness > 180) {
              backgroundAnalysis.lightCount++;
            }
          }
        }
      } catch (error) {
        // Continue with other elements
      }
    }

    if (backgroundAnalysis.totalAnalyzed > 0) {
      const darkRatio = backgroundAnalysis.darkCount / backgroundAnalysis.totalAnalyzed;
      const lightRatio = backgroundAnalysis.lightCount / backgroundAnalysis.totalAnalyzed;

      darkScore += weights.backgroundColors * darkRatio * 3;
      lightScore += weights.backgroundColors * lightRatio * 3;
    }

    // 5. Enhanced CSS variables analysis
    const cssVarsToCheck = [
      '--background-color',
      '--bg-color',
      '--background',
      '--bg',
      '--color-bg',
      '--color-background',
      '--theme-bg',
      '--primary-bg',
      '--surface',
      '--surface-color',
      '--base-color',
      '--canvas',
      '--page-bg',
      '--body-bg',
      '--main-bg',
      '--content-bg',
    ];

    const cssVarAnalysis = { darkCount: 0, lightCount: 0 };

    cssVarsToCheck.forEach(varName => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
      if (value) {
        const brightness = getColorBrightness(value.trim());
        if (brightness !== null) {
          if (brightness < 120) cssVarAnalysis.darkCount++;
          else if (brightness > 180) cssVarAnalysis.lightCount++;
        }
      }
    });

    if (cssVarAnalysis.darkCount > 0) darkScore += weights.cssVariables * cssVarAnalysis.darkCount;
    if (cssVarAnalysis.lightCount > 0) lightScore += weights.cssVariables * cssVarAnalysis.lightCount;

    // 6. Text color analysis
    const textElements = [
      document.querySelector('h1, h2, h3'),
      document.querySelector('p'),
      document.querySelector('a'),
      document.querySelector('.content, article, section'),
    ].filter(Boolean);

    const textAnalysis = { lightTextCount: 0, darkTextCount: 0 };

    textElements.forEach(element => {
      try {
        const color = window.getComputedStyle(element as HTMLElement).color;
        const brightness = getColorBrightness(color);
        if (brightness !== null) {
          if (brightness > 180) textAnalysis.lightTextCount++;
          else if (brightness < 100) textAnalysis.darkTextCount++;
        }
      } catch (error) {
        // Continue with other elements
      }
    });

    // Light text suggests dark background
    if (textAnalysis.lightTextCount > textAnalysis.darkTextCount) {
      darkScore += weights.textColors * textAnalysis.lightTextCount;
    } else if (textAnalysis.darkTextCount > textAnalysis.lightTextCount) {
      lightScore += weights.textColors * textAnalysis.darkTextCount;
    }

    // 7. System canvas colors (as fallback)
    try {
      const testDiv = document.createElement('div');
      testDiv.style.cssText = 'position:absolute;top:-9999px;background-color:canvas;color:canvastext;';
      document.body.appendChild(testDiv);

      const canvasBg = window.getComputedStyle(testDiv).backgroundColor;
      const brightness = getColorBrightness(canvasBg);

      document.body.removeChild(testDiv);

      if (brightness !== null) {
        if (brightness < 128) darkScore += weights.systemColors;
        else lightScore += weights.systemColors;
      }
    } catch (error) {
      // Ignore errors
    }

    // 8. Website-specific patterns
    const currentHost = window.location.hostname.toLowerCase();
    const websitePatterns = {
      dark: ['github.com', 'stackoverflow.com', 'reddit.com', 'discord.com', 'twitter.com'],
      light: ['google.com', 'wikipedia.org', 'stackoverflow.com', 'reddit.com'],
    };

    // Check if current site commonly uses dark themes
    if (websitePatterns.dark.some(site => currentHost.includes(site))) {
      // Check for dark theme indicators in URL or page structure
      const url = window.location.href.toLowerCase();
      if (url.includes('dark') || document.querySelector('[data-theme*="dark"]')) {
        darkScore += weights.urlPatterns;
      }
    }
  } catch (error) {
    logThemeDetection('Error in theme scoring', error);
  }

  // Calculate final theme and confidence
  const totalScore = darkScore + lightScore;
  const confidence = Math.min(totalScore / 20, 1); // Normalize to 0-1

  let theme: ThemeMode;
  if (totalScore === 0 || Math.abs(darkScore - lightScore) < 2) {
    theme = 'system';
  } else {
    theme = darkScore > lightScore ? 'dark' : 'light';
  }

  logThemeDetection('Theme detection scoring complete', {
    darkScore,
    lightScore,
    totalScore,
    confidence,
    finalTheme: theme,
  });

  return { theme, confidence, scores: { dark: darkScore, light: lightScore } };
}

/**
 * Utility function to calculate color brightness from various color formats
 * @param colorValue CSS color value (rgb, rgba, hex, hsl, etc.)
 * @returns Brightness value (0-255) or null if parsing fails
 */
function getColorBrightness(colorValue: string): number | null {
  if (!colorValue) return null;

  const value = colorValue.trim();

  // RGB/RGBA format
  const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const [_, r, g, b] = rgbMatch.map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  // Hex format
  const hexMatch = value.match(/#([0-9a-f]{3,6})/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    let r, g, b;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return (r * 299 + g * 587 + b * 114) / 1000;
    }
  }

  // HSL format
  const hslMatch = value.match(/hsla?\(\d+,\s*\d+%?,\s*(\d+)%?/i);
  if (hslMatch) {
    const lightness = parseInt(hslMatch[1], 10);
    return (lightness / 100) * 255; // Convert percentage to 0-255 scale
  }

  return null;
}

/**
 * Website-specific theme detection patterns
 */
function detectWebsiteSpecificTheme(): ThemeMode | null {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();

  // GitHub
  if (hostname.includes('github.com')) {
    // Check for dark theme indicators
    if (
      document.querySelector('[data-color-mode="dark"]') ||
      document.body.getAttribute('data-color-mode') === 'dark' ||
      document.documentElement.getAttribute('data-color-mode') === 'dark' ||
      document.querySelector('[data-color-scheme="dark"]') ||
      document.body.getAttribute('data-color-scheme') === 'dark' ||
      document.documentElement.getAttribute('data-color-scheme') === 'dark'
    ) {
      return 'dark';
    }
    if (
      document.querySelector('[data-color-mode="light"]') ||
      document.body.getAttribute('data-color-mode') === 'light' ||
      document.documentElement.getAttribute('data-color-mode') === 'light' ||
      document.querySelector('[data-color-scheme="light"]') ||
      document.body.getAttribute('data-color-scheme') === 'light' ||
      document.documentElement.getAttribute('data-color-scheme') === 'light'
    ) {
      return 'light';
    }
  }

  // Reddit
  if (hostname.includes('reddit.com')) {
    if (document.querySelector('[data-theme="dark"]') || document.documentElement.className.includes('theme-dark')) {
      return 'dark';
    }
  }

  // Discord
  if (hostname.includes('discord.com')) {
    if (document.querySelector('[class*="theme-dark"]') || document.body.className.includes('theme-dark')) {
      return 'dark';
    }
  }

  // Twitter/X
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    if (document.querySelector('[data-theme="dark"]') || document.documentElement.style.colorScheme === 'dark') {
      return 'dark';
    }
  }

  // YouTube
  if (hostname.includes('youtube.com')) {
    if (document.querySelector('[dark]') || document.documentElement.getAttribute('dark') !== null) {
      return 'dark';
    }
  }

  // Stack Overflow
  if (hostname.includes('stackoverflow.com')) {
    if (document.querySelector('.theme-dark') || document.body.className.includes('theme-dark')) {
      return 'dark';
    }
  }

  return null;
}

/**
 * Main theme detection function with multiple strategies
 * @returns The detected theme mode
 */
export function detectTheme(): ThemeMode {
  if (cachedTheme) {
    logThemeDetection('Returning cached theme', cachedTheme);
    return cachedTheme;
  }

  logThemeDetection('Starting theme detection');

  try {
    const bodyEl = document.body;
    const htmlEl = document.documentElement;

    if (!bodyEl || !htmlEl) {
      logThemeDetection('Body or HTML element not found, defaulting to system');
      cachedTheme = 'system';
      return cachedTheme;
    }

    // Strategy 1: Check website-specific patterns first (highest priority)
    const websiteTheme = detectWebsiteSpecificTheme();
    if (websiteTheme) {
      logThemeDetection('Theme detected from website-specific patterns', websiteTheme);
      cachedTheme = websiteTheme;
      return cachedTheme;
    }

    // Strategy 2: Use scoring mechanism for comprehensive analysis
    const scoringResult = detectThemeWithScoring();
    if (scoringResult.confidence > 0.3) {
      // Only use if we have reasonable confidence
      logThemeDetection('Theme detected from scoring mechanism', scoringResult);
      cachedTheme = scoringResult.theme;
      return cachedTheme;
    }

    // Strategy 3: Legacy detection methods as fallback

    // Check for prefers-color-scheme in CSS media queries
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      logThemeDetection('Dark theme detected from prefers-color-scheme');
      cachedTheme = 'dark';
      return cachedTheme;
    }

    // Check data attributes with expanded patterns
    const themeDataAttrs = [
      bodyEl.getAttribute('data-theme'),
      htmlEl.getAttribute('data-theme'),
      bodyEl.getAttribute('data-color-mode'),
      htmlEl.getAttribute('data-color-mode'),
      bodyEl.getAttribute('data-color-scheme'),
      htmlEl.getAttribute('data-color-scheme'),
      bodyEl.getAttribute('data-bs-theme'), // Bootstrap theme
      htmlEl.getAttribute('data-bs-theme'),
      bodyEl.getAttribute('theme'),
      htmlEl.getAttribute('theme'),
    ];

    logThemeDetection('Checking data attributes', themeDataAttrs);

    for (const attr of themeDataAttrs) {
      if (attr) {
        const attrValue = attr.toLowerCase();
        if (attrValue.includes('dark') || attrValue === 'dark') {
          logThemeDetection('Dark theme detected from data attributes', attr);
          cachedTheme = 'dark';
          return cachedTheme;
        }
        if (attrValue.includes('light') || attrValue === 'light') {
          logThemeDetection('Light theme detected from data attributes', attr);
          cachedTheme = 'light';
          return cachedTheme;
        }
      }
    }

    // Check for meta tags
    const metaTags = document.querySelectorAll(
      'meta[name*="theme"], meta[name*="color-scheme"], meta[name*="theme-color"]',
    );
    for (const meta of metaTags) {
      const content = meta.getAttribute('content')?.toLowerCase();
      if (content?.includes('dark')) {
        logThemeDetection('Dark theme detected from meta tags');
        cachedTheme = 'dark';
        return cachedTheme;
      }
      if (content?.includes('light')) {
        logThemeDetection('Light theme detected from meta tags');
        cachedTheme = 'light';
        return cachedTheme;
      }
    }

    // Enhanced class name detection with more patterns
    const bodyClasses = bodyEl.className.toLowerCase() || '';
    const htmlClasses = htmlEl.className.toLowerCase() || '';
    const allClasses = `${bodyClasses} ${htmlClasses}`;

    logThemeDetection('Checking class names', { bodyClasses, htmlClasses });

    // Extended dark theme patterns
    const darkClassPatterns = [
      'dark-theme',
      'theme-dark',
      'dark-mode',
      'dark',
      'night-mode',
      'nightmode',
      'black-theme',
      'theme-black',
      'noir',
      'midnight',
      'shadow',
      'carbon',
      'slate',
      'charcoal',
      'obsidian',
      'dim',
      'dusky',
      'darker',
      'darkened',
      'invert',
      'inverted',
      'contrast-dark',
      'scheme-dark',
      'color-scheme-dark',
      'theme-dark-mode',
      'darktheme',
      'dark_theme',
      'dark_mode',
      'mode-dark',
      'is-dark',
      'has-dark-theme',
    ];

    const lightClassPatterns = [
      'light-theme',
      'theme-light',
      'light-mode',
      'light',
      'day-mode',
      'daymode',
      'white-theme',
      'theme-white',
      'bright',
      'default-theme',
      'normal',
      'classic',
      'standard',
      'vanilla',
      'clean',
      'minimal',
      'bright-mode',
      'contrast-light',
      'scheme-light',
      'color-scheme-light',
      'theme-light-mode',
      'lighttheme',
      'light_theme',
      'light_mode',
      'mode-light',
      'is-light',
      'has-light-theme',
    ];

    // Use word boundaries for more precise matching
    const hasDarkClass = darkClassPatterns.some(pattern => new RegExp(`\\b${pattern}\\b`, 'i').test(allClasses));
    const hasLightClass = lightClassPatterns.some(pattern => new RegExp(`\\b${pattern}\\b`, 'i').test(allClasses));

    if (hasDarkClass) {
      logThemeDetection('Dark theme detected from class names');
      cachedTheme = 'dark';
      return cachedTheme;
    }

    if (hasLightClass) {
      logThemeDetection('Light theme detected from class names');
      cachedTheme = 'light';
      return cachedTheme;
    }

    // Enhanced background color analysis with multiple elements
    const elementsToCheck = [
      { element: bodyEl, name: 'body' },
      { element: htmlEl, name: 'html' },
      // Check main content areas
      ...Array.from(document.querySelectorAll('main, [role="main"], .main-content, #main, #content, .content'))
        .slice(0, 3)
        .map((el, i) => ({ element: el as HTMLElement, name: `main-${i}` })),
      // Check common wrapper elements
      ...Array.from(document.querySelectorAll('.app, #app, .wrapper, .container, .page, .layout'))
        .slice(0, 2)
        .map((el, i) => ({ element: el as HTMLElement, name: `wrapper-${i}` })),
      // Check header/navigation
      ...Array.from(document.querySelectorAll('header, nav, .header, .navbar'))
        .slice(0, 2)
        .map((el, i) => ({ element: el as HTMLElement, name: `nav-${i}` })),
    ];

    const backgroundAnalysisResults: Array<{ name: string; brightness: number; isDark: boolean }> = [];

    for (const { element, name } of elementsToCheck) {
      try {
        if (!element) continue;

        const computedStyle = window.getComputedStyle(element);
        const bgColor = computedStyle.backgroundColor;

        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
          const brightness = getColorBrightness(bgColor);
          if (brightness !== null) {
            const isDark = brightness < 120; // More strict threshold
            backgroundAnalysisResults.push({ name, brightness, isDark });
            logThemeDetection(`Background analysis for ${name}`, { bgColor, brightness, isDark });
          }
        }
      } catch (error) {
        logThemeDetection(`Error analyzing background color for ${name}`, error);
      }
    }

    // Analyze results - if majority of elements suggest dark theme
    if (backgroundAnalysisResults.length > 0) {
      const darkCount = backgroundAnalysisResults.filter(result => result.isDark).length;
      const lightCount = backgroundAnalysisResults.length - darkCount;

      logThemeDetection('Background analysis summary', {
        total: backgroundAnalysisResults.length,
        dark: darkCount,
        light: lightCount,
        results: backgroundAnalysisResults,
      });

      if (darkCount > lightCount) {
        logThemeDetection('Dark theme detected from background color analysis');
        cachedTheme = 'dark';
        return cachedTheme;
      } else if (lightCount > darkCount) {
        logThemeDetection('Light theme detected from background color analysis');
        cachedTheme = 'light';
        return cachedTheme;
      }
    }

    // Enhanced CSS variables analysis
    const cssVarsToCheck = [
      '--background-color',
      '--bg-color',
      '--background',
      '--bg',
      '--color-bg',
      '--color-background',
      '--theme-bg',
      '--primary-bg',
      '--surface',
      '--surface-color',
      '--base-color',
      '--canvas',
      '--page-bg',
      '--body-bg',
      '--main-bg',
      '--content-bg',
      '--theme-background',
      '--app-background',
      '--global-background',
    ];

    logThemeDetection('Checking CSS variables', cssVarsToCheck);

    for (const varName of cssVarsToCheck) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
      if (value) {
        const colorValue = value.trim();
        const brightness = getColorBrightness(colorValue);

        if (brightness !== null) {
          logThemeDetection(`CSS variable ${varName} brightness`, { colorValue, brightness });

          if (brightness < 120) {
            logThemeDetection('Dark theme detected from CSS variables');
            cachedTheme = 'dark';
            return cachedTheme;
          } else if (brightness > 180) {
            logThemeDetection('Light theme detected from CSS variables');
            cachedTheme = 'light';
            return cachedTheme;
          }
        }
      }
    }

    // Enhanced text color contrast analysis
    const textElements = [
      document.querySelector('h1, h2, h3'),
      document.querySelector('p'),
      document.querySelector('a'),
      document.querySelector('.content, article, section'),
      document.querySelector('span'),
      document.querySelector('div'),
    ].filter(Boolean) as HTMLElement[];

    let lightTextCount = 0;
    let darkTextCount = 0;

    for (const element of textElements.slice(0, 5)) {
      try {
        const computedStyle = window.getComputedStyle(element);
        const textColor = computedStyle.color;

        if (textColor && textColor !== 'rgba(0, 0, 0, 0)') {
          const brightness = getColorBrightness(textColor);
          if (brightness !== null) {
            if (brightness > 180) {
              lightTextCount++; // Light text suggests dark background
            } else if (brightness < 100) {
              darkTextCount++; // Dark text suggests light background
            }

            logThemeDetection(`Text color analysis for ${element.tagName}`, {
              textColor,
              brightness,
              classification: brightness > 180 ? 'light-text' : brightness < 100 ? 'dark-text' : 'neutral',
            });
          }
        }
      } catch (error) {
        logThemeDetection(`Error analyzing text color for ${element.tagName}`, error);
      }
    }

    logThemeDetection('Text color analysis summary', { lightTextCount, darkTextCount });

    // If we have significantly more light text, it's probably a dark theme
    if (lightTextCount > darkTextCount && lightTextCount >= 2) {
      logThemeDetection('Dark theme detected from text color analysis');
      cachedTheme = 'dark';
      return cachedTheme;
    } else if (darkTextCount > lightTextCount && darkTextCount >= 2) {
      logThemeDetection('Light theme detected from text color analysis');
      cachedTheme = 'light';
      return cachedTheme;
    }

    // Final fallback: system canvas colors
    try {
      const testDiv = document.createElement('div');
      testDiv.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        background-color: canvas;
        color: canvastext;
      `;
      document.body.appendChild(testDiv);

      const testStyle = window.getComputedStyle(testDiv);
      const bgColor = testStyle.backgroundColor;

      document.body.removeChild(testDiv);

      if (bgColor) {
        const brightness = getColorBrightness(bgColor);
        if (brightness !== null) {
          logThemeDetection('System canvas color analysis', { bgColor, brightness });

          if (brightness < 128) {
            logThemeDetection('Dark theme detected from system canvas colors');
            cachedTheme = 'dark';
            return cachedTheme;
          } else {
            logThemeDetection('Light theme detected from system canvas colors');
            cachedTheme = 'light';
            return cachedTheme;
          }
        }
      }
    } catch (error) {
      logThemeDetection('Error in system color analysis', error);
    }
  } catch (error) {
    logThemeDetection('Error in theme detection', error);
  }

  // Default to system if we can't determine
  logThemeDetection('Could not determine theme, defaulting to system');
  cachedTheme = 'system';
  return cachedTheme;
}

/**
 * Get the current theme state for change detection
 */
function getCurrentThemeState() {
  const bodyEl = document.body;
  const htmlEl = document.documentElement;

  return {
    bodyClasses: bodyEl?.className || '',
    htmlClasses: htmlEl?.className || '',
    bodyDataTheme: bodyEl?.getAttribute('data-theme') || '',
    htmlDataTheme: htmlEl?.getAttribute('data-theme') || '',
    bodyBgColor: bodyEl ? window.getComputedStyle(bodyEl).backgroundColor : '',
    isDark: detectTheme() === 'dark',
  };
}

/**
 * Start monitoring for theme changes
 */
export function startThemeMonitoring(): void {
  if (themeObserver) {
    return; // Already monitoring
  }

  let debounceTimeout: number;

  const checkThemeChange = () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      const newThemeState = getCurrentThemeState();

      // Check if theme has actually changed
      if (
        newThemeState.isDark !== currentThemeState.isDark ||
        newThemeState.bodyClasses !== currentThemeState.bodyClasses ||
        newThemeState.htmlClasses !== currentThemeState.htmlClasses ||
        newThemeState.bodyDataTheme !== currentThemeState.bodyDataTheme ||
        newThemeState.htmlDataTheme !== currentThemeState.htmlDataTheme ||
        newThemeState.bodyBgColor !== currentThemeState.bodyBgColor
      ) {
        logThemeDetection('Theme change detected', {
          old: currentThemeState,
          new: newThemeState,
        });

        // Clear cached theme to force re-detection
        cachedTheme = null;

        // Update current state
        currentThemeState = newThemeState;

        // Notify listeners
        themeChangeListeners.forEach(callback => {
          try {
            callback(newThemeState.isDark);
          } catch (error) {
            logThemeDetection('Error in theme change callback', error);
          }
        });

        // Update all function blocks automatically
        updateAllFunctionBlockThemes();
      }
    }, THEME_CHANGE_DELAY);
  };

  // Set up mutation observer for DOM changes
  themeObserver = new MutationObserver(mutations => {
    let shouldCheck = false;

    for (const mutation of mutations) {
      // Check for class changes
      if (
        mutation.type === 'attributes' &&
        (mutation.attributeName === 'class' || mutation.attributeName?.startsWith('data-'))
      ) {
        shouldCheck = true;
        break;
      }

      // Check for style changes
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        shouldCheck = true;
        break;
      }
    }

    if (shouldCheck) {
      checkThemeChange();
    }
  });

  // Start observing
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-mode', 'data-color-scheme', 'data-bs-theme', 'style'],
    subtree: false,
  });

  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-mode', 'data-color-scheme', 'data-bs-theme', 'style'],
    subtree: false,
  });

  // Listen for CSS media query changes
  if (window.matchMedia) {
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const lightModeMediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const handleMediaQueryChange = (e: MediaQueryListEvent) => {
      logThemeDetection('Media query change detected', { matches: e.matches, media: e.media });
      checkThemeChange();
    };

    darkModeMediaQuery.addEventListener('change', handleMediaQueryChange);
    lightModeMediaQuery.addEventListener('change', handleMediaQueryChange);

    // Store references for cleanup
    (window as any)._themeMediaQueryListeners = {
      dark: { query: darkModeMediaQuery, handler: handleMediaQueryChange },
      light: { query: lightModeMediaQuery, handler: handleMediaQueryChange },
    };
  }

  // Listen for storage events (for websites that sync theme via localStorage/sessionStorage)
  const handleStorageChange = (e: StorageEvent) => {
    if (
      e.key &&
      (e.key.includes('theme') || e.key.includes('dark') || e.key.includes('light') || e.key.includes('color'))
    ) {
      logThemeDetection('Storage change detected for theme-related key', { key: e.key, newValue: e.newValue });
      checkThemeChange();
    }
  };

  window.addEventListener('storage', handleStorageChange);
  (window as any)._themeStorageListener = handleStorageChange;

  // Listen for custom theme change events that websites might dispatch
  const customThemeEvents = [
    'themechange',
    'theme-change',
    'colorschemechange',
    'color-scheme-change',
    'darkmodechange',
    'dark-mode-change',
    'lightmodechange',
    'light-mode-change',
  ];

  const handleCustomThemeEvent = (e: Event) => {
    logThemeDetection('Custom theme event detected', { type: e.type, detail: (e as CustomEvent).detail });
    checkThemeChange();
  };

  customThemeEvents.forEach(eventType => {
    document.addEventListener(eventType, handleCustomThemeEvent);
    window.addEventListener(eventType, handleCustomThemeEvent);
  });

  (window as any)._themeCustomEventListeners = {
    handler: handleCustomThemeEvent,
    events: customThemeEvents,
  };

  // Watch for CSS variable changes using ResizeObserver trick
  if (window.ResizeObserver) {
    const themeVariableWatcher = document.createElement('div');
    themeVariableWatcher.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 1px;
      height: 1px;
      background: var(--background-color, var(--bg-color, var(--background, transparent)));
      color: var(--text-color, var(--color, inherit));
      pointer-events: none;
    `;
    document.body.appendChild(themeVariableWatcher);

    const lastComputedStyle = window.getComputedStyle(themeVariableWatcher);
    let lastBgColor = lastComputedStyle.backgroundColor;
    let lastTextColor = lastComputedStyle.color;

    const variableObserver = new ResizeObserver(() => {
      const currentStyle = window.getComputedStyle(themeVariableWatcher);
      const currentBgColor = currentStyle.backgroundColor;
      const currentTextColor = currentStyle.color;

      if (currentBgColor !== lastBgColor || currentTextColor !== lastTextColor) {
        logThemeDetection('CSS variable change detected', {
          bgColor: { old: lastBgColor, new: currentBgColor },
          textColor: { old: lastTextColor, new: currentTextColor },
        });
        lastBgColor = currentBgColor;
        lastTextColor = currentTextColor;
        checkThemeChange();
      }
    });

    // Trigger observation by changing a property
    const triggerObservation = () => {
      themeVariableWatcher.style.width = themeVariableWatcher.style.width === '1px' ? '2px' : '1px';
    };

    setInterval(triggerObservation, 1000); // Check every second
    variableObserver.observe(themeVariableWatcher);

    (window as any)._themeVariableWatcher = {
      element: themeVariableWatcher,
      observer: variableObserver,
    };
  }

  // Initialize current state
  currentThemeState = getCurrentThemeState();

  logThemeDetection('Enhanced theme monitoring started with multiple detection methods');
}

/**
 * Stop monitoring for theme changes
 */
export function stopThemeMonitoring(): void {
  if (themeObserver) {
    themeObserver.disconnect();
    themeObserver = null;
  }

  // Clean up media query listeners
  const mediaQueryListeners = (window as any)._themeMediaQueryListeners;
  if (mediaQueryListeners) {
    mediaQueryListeners.dark?.query?.removeEventListener('change', mediaQueryListeners.dark.handler);
    mediaQueryListeners.light?.query?.removeEventListener('change', mediaQueryListeners.light.handler);
    delete (window as any)._themeMediaQueryListeners;
  }

  // Clean up storage listener
  const storageListener = (window as any)._themeStorageListener;
  if (storageListener) {
    window.removeEventListener('storage', storageListener);
    delete (window as any)._themeStorageListener;
  }

  // Clean up custom event listeners
  const customEventListeners = (window as any)._themeCustomEventListeners;
  if (customEventListeners) {
    customEventListeners.events.forEach((eventType: string) => {
      document.removeEventListener(eventType, customEventListeners.handler);
      window.removeEventListener(eventType, customEventListeners.handler);
    });
    delete (window as any)._themeCustomEventListeners;
  }

  // Clean up CSS variable watcher
  const variableWatcher = (window as any)._themeVariableWatcher;
  if (variableWatcher) {
    variableWatcher.observer?.disconnect();
    if (variableWatcher.element && variableWatcher.element.parentNode) {
      variableWatcher.element.parentNode.removeChild(variableWatcher.element);
    }
    delete (window as any)._themeVariableWatcher;
  }

  logThemeDetection('Enhanced theme monitoring stopped and cleaned up');
}

/**
 * Add a callback for theme changes
 */
export function addThemeChangeListener(callback: ThemeChangeCallback): void {
  themeChangeListeners.push(callback);
}

/**
 * Remove a callback for theme changes
 */
export function removeThemeChangeListener(callback: ThemeChangeCallback): void {
  const index = themeChangeListeners.indexOf(callback);
  if (index > -1) {
    themeChangeListeners.splice(index, 1);
  }
}

/**
 * Force theme re-detection
 */
export function forceThemeRedetection(): ThemeMode {
  cachedTheme = null;
  return detectTheme();
}

/**
 * Get the current detected theme with confidence score
 */
export function getThemeWithConfidence(): { theme: ThemeMode; confidence: number } {
  const scoringResult = detectThemeWithScoring();
  return { theme: scoringResult.theme, confidence: scoringResult.confidence };
}

/**
 * Check if the current theme is dark
 * @returns true if the current theme is dark, false otherwise
 */
export function isDarkTheme(): boolean {
  const theme = detectTheme();
  return theme === 'dark';
}

/**
 * Apply theme class to an element based on detected theme
 * @param element The element to apply theme class to
 */
export function applyThemeClass(element: HTMLElement): void {
  const theme = detectTheme();

  // Remove existing theme classes
  element.classList.remove('theme-light', 'theme-dark', 'theme-system');

  // Apply appropriate theme class
  element.classList.add(`theme-${theme}`);

  // Set data attribute for CSS targeting
  element.setAttribute('data-theme', theme);

  logThemeDetection(`Applied theme class: theme-${theme}`, { element: element.className });
}

/**
 * Update theme for all rendered function blocks
 */
export function updateAllFunctionBlockThemes(): void {
  if (renderedFunctionBlocks && renderedFunctionBlocks.size > 0) {
    renderedFunctionBlocks.forEach((block, key) => {
      applyThemeClass(block);
    });
    logThemeDetection(`Updated theme for ${renderedFunctionBlocks.size} function blocks`);
  }
}

/**
 * Initialize automatic theme detection and monitoring
 * This function should be called when the page loads to start monitoring
 */
export function initializeThemeDetection(): void {
  // Start theme monitoring
  startThemeMonitoring();

  // Force initial theme detection
  forceThemeRedetection();

  logThemeDetection('Theme detection initialized');
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeThemeDetection);
  } else {
    // DOM is already ready
    initializeThemeDetection();
  }
}
