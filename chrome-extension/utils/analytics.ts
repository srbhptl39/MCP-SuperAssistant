// import { logMessage } from './helpers'; // Assuming helpers exists in utils - Replaced with console.debug

// IMPORTANT: Load credentials via environment variables during build
// It's strongly recommended to load these from a secure configuration or environment variables during build,
// rather than hardcoding them directly in the source code.
// Create a .env file in the chrome-extension directory with:
// VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
// VITE_GA_API_SECRET=YOUR_API_SECRET
// Ensure .env is in your .gitignore file!
// VITE_GA_API_SECRET=YOUR_API_SECRET
// Ensure .env is in your .gitignore file!
const MEASUREMENT_ID = import.meta.env.CEB_GA_MEASUREMENT_ID;
const API_SECRET = import.meta.env.CEB_GA_API_SECRET;

const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';

// Use debug endpoint for development
const IS_DEV_MODE = !('update_url' in chrome.runtime.getManifest());
// const API_ENDPOINT = IS_DEV_MODE ? GA_DEBUG_ENDPOINT : GA_ENDPOINT;
const API_ENDPOINT = GA_ENDPOINT;

const DEFAULT_ENGAGEMENT_TIME_IN_MSEC = 100; // Standard value for measurement protocol
const SESSION_EXPIRATION_IN_MIN = 30;

// Store the last URL to detect changes
const lastUrl: string = '';

// Check if we're in a browser context (content script) or service worker (background)
const isWindowContext = typeof window !== 'undefined';

// --- Client ID Management ---
async function getOrCreateClientId(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('clientId');
    let clientId = result.clientId;
    if (!clientId) {
      // Generate a unique client ID, the actual value is not relevant
      clientId = self.crypto.randomUUID();
      await chrome.storage.local.set({ clientId });
      // logMessage('[GA4] Generated new clientId:', clientId);
      console.debug('[GA4] Generated new clientId:', clientId);
    }
    return clientId;
  } catch (error) {
    console.error('[GA4] Error getting or creating clientId:', error);
    // Fallback or rethrow depending on desired robustness
    return 'error-client-id';
  }
}

// --- Session ID Management ---
async function getOrCreateSessionId(): Promise<string> {
  try {
    // Use session storage to keep session ID alive while browser is open
    let { sessionData } = await chrome.storage.session.get('sessionData');
    const currentTimeInMs = Date.now();

    if (sessionData && sessionData.timestamp) {
      const durationInMin = (currentTimeInMs - sessionData.timestamp) / 60000;
      // Check if session has expired
      if (durationInMin > SESSION_EXPIRATION_IN_MIN) {
        sessionData = null; // Expired, start a new session
        // logMessage('[GA4] Session expired, starting new one.');
        console.debug('[GA4] Session expired, starting new one.');
      } else {
        // Session valid, update timestamp
        sessionData.timestamp = currentTimeInMs;
        await chrome.storage.session.set({ sessionData });
      }
    }

    if (!sessionData) {
      // Create and store a new session
      sessionData = {
        session_id: currentTimeInMs.toString(),
        timestamp: currentTimeInMs, // Store timestamp as number
      };
      await chrome.storage.session.set({ sessionData });
      // logMessage('[GA4] Created new session:', sessionData.session_id);
      console.debug('[GA4] Created new session:', sessionData.session_id);
    }
    return sessionData.session_id;
  } catch (error) {
    console.error('[GA4] Error getting or creating session_id:', error);
    return 'error-session-id';
  }
}

// --- Event Sending ---
/**
 * Sends an event to Google Analytics using the Measurement Protocol.
 *
 * @param name The name of the event.
 * @param params Additional parameters for the event.
 * @param userProperties Optional user properties to set (only needed on first event or when updating).
 */
export async function sendAnalyticsEvent(
  name: string,
  params: { [key: string]: any },
  userProperties?: { [key: string]: { value: any } }
): Promise<void> {
  // Basic check for essential credentials
  if (
    !MEASUREMENT_ID ||
    !API_SECRET ||
    MEASUREMENT_ID === 'G-XXXXXXXXXX' /* Check for placeholder */ ||
    API_SECRET === 'YOUR_API_SECRET' /* Check for placeholder */
  ) {
    // Check if placeholders are still present or if env vars are missing
    console.warn(
      '[GA4] Analytics tracking is disabled. Ensure CEB_GA_MEASUREMENT_ID and CEB_GA_API_SECRET are set in your .env file and the build process is using them.',
    );
    return;
  }

  try {
    const clientId = await getOrCreateClientId();
    const sessionId = await getOrCreateSessionId();

    // Prepare the event payload
    const eventPayload = {
      name,
      params: {
        session_id: sessionId,
        engagement_time_msec: DEFAULT_ENGAGEMENT_TIME_IN_MSEC,
        ...params, // Spread user-provided params
      },
    };

    // Prepare the request body
    const requestBody: any = {
      client_id: clientId,
      events: [eventPayload],
    };

    // Add user properties if provided
    if (userProperties) {
      requestBody.user_properties = userProperties;
    }

    // logMessage(`[GA4] Sending event: ${name}`, params);
    console.debug(`[GA4] Sending event: ${name}`, JSON.stringify(params)); // Stringify params for better logging

    const response = await fetch(`${API_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check status code before attempting to parse body
    if (response.ok) {
      // Response is OK (2xx status code)
      console.debug('[GA4] Event sent successfully.');
      // Only try to parse body if it's not 204 No Content and in debug mode
      if (IS_DEV_MODE && response.status !== 204) {
        try {
          const successBody = await response.json();
          console.debug('[GA4] Debug endpoint success response:', JSON.stringify(successBody, null, 2));
        } catch (parseError) {
          console.debug('[GA4] Debug endpoint success response likely had no body (e.g., 200 OK with empty body).');
        }
      }
    } else {
      // Response is NOT OK (e.g., 4xx, 5xx)
      console.warn(`[GA4] Analytics request failed: ${response.status} ${response.statusText}`);
      // If using debug endpoint, try to log the response body for detailed errors
      if (IS_DEV_MODE) {
        try {
          const errorBody = await response.json();
          console.error('[GA4] Debug endpoint error response:', JSON.stringify(errorBody, null, 2));
        } catch (parseError) {
          console.error('[GA4] Debug endpoint error response could not be parsed as JSON:', await response.text()); // Log as text if JSON fails
        }
      }
    }
  } catch (error) {
    console.error('[GA4] Error sending analytics event:', error);
  }
}

// --- Specific Event Helpers (Optional but Recommended) ---

/**
 * Collects demographic data about the user's environment.
 * This includes browser info, OS, language, screen size, and device type.
 * Works in both content script and background service worker contexts.
 * @returns An object containing demographic data
 */
export function collectDemographicData(): { [key: string]: any } {
  try {
    const userAgent = navigator?.userAgent || 'Unknown';
    const language = navigator?.language || 'en';

    // Parse browser and OS information from user agent (works in ANY context)
    let browser = 'Unknown';
    let browserVersion = 'Unknown';
    let os = 'Unknown';
    let osVersion = 'Unknown';

    // Detect browser
    if (userAgent.indexOf('Firefox') > -1) {
      browser = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
      browserVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('Edg') > -1) {
      browser = 'Edge';
      const match = userAgent.match(/Edg\/(\d+\.\d+)/);
      browserVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('Chrome') > -1) {
      browser = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
      browserVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('Safari') > -1) {
      browser = 'Safari';
      const match = userAgent.match(/Version\/(\d+\.\d+)/);
      browserVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident/') > -1) {
      browser = 'Internet Explorer';
      const match = userAgent.match(/(?:MSIE |rv:)(\d+\.\d+)/);
      browserVersion = match && match[1] ? match[1] : 'Unknown';
    }

    // Detect OS
    if (userAgent.indexOf('Windows') > -1) {
      os = 'Windows';
      const match = userAgent.match(/Windows NT (\d+\.\d+)/);
      const ntVersion = match && match[1] ? match[1] : 'Unknown';
      // Map Windows NT version to Windows version
      const windowsVersions: { [key: string]: string } = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7',
        '6.0': 'Vista',
        '5.2': 'XP x64',
        '5.1': 'XP',
      };
      osVersion = windowsVersions[ntVersion] || ntVersion;
    } else if (userAgent.indexOf('Mac') > -1) {
      os = 'macOS';
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      osVersion = match && match[1] ? match[1].replace(/_/g, '.') : 'Unknown';
    } else if (userAgent.indexOf('Linux') > -1) {
      os = 'Linux';
      const match = userAgent.match(/Linux ([\w\d\.]+)/);
      osVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('Android') > -1) {
      os = 'Android';
      const match = userAgent.match(/Android ([\d\.]+)/);
      osVersion = match && match[1] ? match[1] : 'Unknown';
    } else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1 || userAgent.indexOf('iPad') > -1) {
      os = 'iOS';
      const match = userAgent.match(/OS ([\d_]+)/);
      osVersion = match && match[1] ? match[1].replace(/_/g, '.') : 'Unknown';
    }

    // Determine device type
    let deviceType = 'desktop';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) {
      deviceType = /iPad|tablet/i.test(userAgent) ? 'tablet' : 'mobile';
    }

    // Get country/region (this will be limited and may need server-side enrichment)
    // For privacy reasons, we're just using the language as a proxy
    const region = language.split('-')[1] || language;

    // Window-dependent features (only available in content script context)
    let screenResolution = 'Unknown';
    let pixelRatio = 1;
    let timezone = 'Unknown';
    let timezoneOffset = 0;

    if (isWindowContext && typeof window !== 'undefined') {
      try {
        screenResolution = `${window.screen.width}x${window.screen.height}`;
        pixelRatio = window.devicePixelRatio || 1;
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timezoneOffset = new Date().getTimezoneOffset() / -60; // Convert to hours, invert sign
      } catch (windowError) {
        console.debug('[GA4] Window-dependent features not available:', windowError);
      }
    }

    return {
      browser,
      browser_version: browserVersion,
      operating_system: os,
      os_version: osVersion,
      language,
      region,
      screen_resolution: screenResolution,
      pixel_ratio: pixelRatio,
      device_type: deviceType,
      timezone,
      timezone_offset: timezoneOffset,
      user_agent: userAgent,
      context: isWindowContext ? 'content_script' : 'background_service_worker',
    };
  } catch (error) {
    console.error('[GA4] Error collecting demographic data:', error);
    return {
      browser: 'Unknown',
      browser_version: 'Unknown',
      operating_system: 'Unknown',
      os_version: 'Unknown',
      language: 'en',
      region: 'Unknown',
      screen_resolution: 'Unknown',
      pixel_ratio: 1,
      device_type: 'desktop',
      timezone: 'Unknown',
      timezone_offset: 0,
      user_agent: 'Unknown',
      context: 'error',
      error: 'Failed to collect demographic data',
    };
  }
}

/**
 * Tracks a URL change event with demographic data.
 * @param url The new URL
 */
export async function trackUrlChange(url: string): Promise<void> {
  const demographicData = collectDemographicData();

  // Only include document.title if in browser context
  const pageTitle = isWindowContext ? document.title : 'Unknown';

  await sendAnalyticsEvent('url_change', {
    page_location: url,
    page_title: pageTitle,
    previous_page: lastUrl,
    ...demographicData,
  });
}

/**
 * Sends a 'page_view' event. Automatically includes title and location.
 * Call this from extension pages (popup, options, side panel) or content scripts if needed.
 */
export async function trackPageView(): Promise<void> {
  // Only run in browser context
  if (!isWindowContext) {
    console.debug('[GA4] Page view tracking skipped - not in browser context');
    return;
  }

  const demographicData = collectDemographicData();

  await sendAnalyticsEvent('page_view', {
    page_title: document.title,
    page_location: document.location.href,
    ...demographicData,
  });
}

/**
 * Sends an 'extension_error' event for tracking issues.
 * @param error The error object.
 * @param context Additional context (e.g., 'background', 'content_script').
 */
export async function trackError(error: Error, context: string): Promise<void> {
  await sendAnalyticsEvent('extension_error', {
    error_message: error.message,
    error_stack: error.stack?.substring(0, 500), // Limit stack trace length
    error_context: context,
  });
}
