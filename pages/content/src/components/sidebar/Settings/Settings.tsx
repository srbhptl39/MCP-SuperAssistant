import React from 'react';
import { useUserPreferences } from '@src/hooks';
import { ToggleWithoutLabel, Button } from '../ui';
import { AutomationService } from '@src/services/automation.service';
import { cn } from '@src/lib/utils';
import { logMessage } from '@src/utils/helpers';
import { createLogger } from '@extension/shared/lib/logger';

// Default delay values in seconds

const logger = createLogger('Settings');

const DEFAULT_DELAYS = {
  autoInsertDelay: 2,
  autoSubmitDelay: 2,
  autoExecuteDelay: 2
} as const;

const sectionLabelClass = 'text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500';
const delayInputClass =
  'h-8 w-20 text-sm text-right rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500';

const Settings: React.FC = () => {
  const { preferences, updatePreferences } = useUserPreferences();

  const isPushMode = preferences.isPushMode ?? false;

  const handlePushModeToggle = (checked: boolean) => {
    updatePreferences({ isPushMode: checked });
    logMessage(`[Settings] Push mode ${checked ? 'enabled' : 'disabled'}`);
  };

  // Handle delay input changes
  const handleDelayChange = (type: 'autoInsert' | 'autoSubmit' | 'autoExecute', value: string) => {
    const delay = Math.max(0, parseInt(value) || 0); // Ensure non-negative integer
    logger.debug(`${type} delay changed to: ${delay}`);

    // Update user preferences store with the new delay
    updatePreferences({ [`${type}Delay`]: delay });

    // Store in localStorage
    try {
      const storedDelays = JSON.parse(localStorage.getItem('mcpDelaySettings') || '{}');
      localStorage.setItem('mcpDelaySettings', JSON.stringify({
        ...storedDelays,
        [`${type}Delay`]: delay
      }));
    } catch (error) {
      logger.error('[Settings] Error storing delay settings:', error);
    }

    // Update automation state on window
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
  };

  // Load stored delays on component mount, set default to 2 seconds if not set
  React.useEffect(() => {
    try {
      const storedDelays = JSON.parse(localStorage.getItem('mcpDelaySettings') || '{}');
      // If no stored delays, use defaults
      if (Object.keys(storedDelays).length === 0) {
        updatePreferences(DEFAULT_DELAYS);
        localStorage.setItem('mcpDelaySettings', JSON.stringify(DEFAULT_DELAYS));
      } else {
        // Use stored delays
        updatePreferences(storedDelays);
      }
    } catch (error) {
      logger.error('[Settings] Error loading stored delay settings:', error);
      // Set defaults on error
      updatePreferences(DEFAULT_DELAYS);
      localStorage.setItem('mcpDelaySettings', JSON.stringify(DEFAULT_DELAYS));
    }
  }, [updatePreferences]);

  return (
    <div className="py-3 space-y-5">
      {/* Layout */}
      <div className="space-y-2">
        <div className={sectionLabelClass}>Layout</div>
        <div className="flex items-center justify-between py-1">
          <label className="text-sm text-slate-700 dark:text-slate-300">Push Content Mode</label>
          <ToggleWithoutLabel label="Push Content Mode" checked={isPushMode} onChange={handlePushModeToggle} />
        </div>
      </div>

      {/* Automation delays */}
      <div className="space-y-2">
        <div className={sectionLabelClass}>Automation delays</div>

        <div className="flex items-center justify-between py-1">
          <div>
            <label htmlFor="auto-insert-delay" className="block text-sm text-slate-700 dark:text-slate-300">
              Auto insert
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Delay before inserting content</p>
          </div>
          <input
            id="auto-insert-delay"
            type="number"
            min="0"
            value={preferences.autoInsertDelay || 0}
            onChange={e => handleDelayChange('autoInsert', e.target.value)}
            className={delayInputClass}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <label htmlFor="auto-submit-delay" className="block text-sm text-slate-700 dark:text-slate-300">
              Auto submit
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Delay before submitting form</p>
          </div>
          <input
            id="auto-submit-delay"
            type="number"
            min="0"
            value={preferences.autoSubmitDelay || 0}
            onChange={e => handleDelayChange('autoSubmit', e.target.value)}
            className={delayInputClass}
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <label htmlFor="auto-execute-delay" className="block text-sm text-slate-700 dark:text-slate-300">
              Auto execute
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">Delay before executing functions</p>
          </div>
          <input
            id="auto-execute-delay"
            type="number"
            min="0"
            value={preferences.autoExecuteDelay || 0}
            onChange={e => handleDelayChange('autoExecute', e.target.value)}
            className={delayInputClass}
          />
        </div>
      </div>

      {/* Developer (dev builds only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="space-y-2">
          <div className={sectionLabelClass}>Developer</div>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
            onClick={() => {
              const shadowHost = (window as any).activeSidebarManager?.getShadowHost();
              if (shadowHost && shadowHost.shadowRoot) {
                logMessage('Shadow DOM debug requested');
                // Debug functionality removed - use browser dev tools instead
              } else {
                logMessage('Cannot debug: Shadow DOM not found');
              }
            }}>
            Debug Styles
          </Button>
        </div>
      )}
    </div>
  );
};

export default Settings;
