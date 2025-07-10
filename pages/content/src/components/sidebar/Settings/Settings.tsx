import React from 'react';
import { useUserPreferences } from '@src/hooks';
import { Card, CardContent } from '@src/components/ui/card';
import { Typography } from '../ui';
import { AutomationService } from '@src/services/automation.service';
import { cn } from '@src/lib/utils';

const Settings: React.FC = () => {
  const { preferences, updatePreferences } = useUserPreferences();

  // Handle delay input changes
  const handleDelayChange = (type: 'autoInsert' | 'autoSubmit' | 'autoExecute', value: string) => {
    const delay = Math.max(0, parseInt(value) || 0); // Ensure non-negative integer
    console.debug(`[Settings] ${type} delay changed to: ${delay}`);
    
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
      console.error('[Settings] Error storing delay settings:', error);
    }

    // Update automation state on window
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
  };

  // Load stored delays on component mount
  React.useEffect(() => {
    try {
      const storedDelays = JSON.parse(localStorage.getItem('mcpDelaySettings') || '{}');
      if (Object.keys(storedDelays).length > 0) {
        updatePreferences(storedDelays);
      }
    } catch (error) {
      console.error('[Settings] Error loading stored delay settings:', error);
    }
  }, [updatePreferences]);

  return (
    <div className="p-4 space-y-4">
      <Card className="border-slate-200 dark:border-slate-700 dark:bg-slate-800">
        <CardContent className="p-4">
          <Typography variant="h4" className="mb-4 text-slate-700 dark:text-slate-300">
            Automation Delay Settings
          </Typography>
          
          <div className="space-y-4">
            {/* Auto Insert Delay */}
            <div>
              <label
                htmlFor="auto-insert-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Auto Insert Delay (seconds)
              </label>
              <input
                id="auto-insert-delay"
                type="number"
                min="0"
                value={preferences.autoInsertDelay || 0}
                onChange={(e) => handleDelayChange('autoInsert', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Delay before auto-inserting content
              </p>
            </div>

            {/* Auto Submit Delay */}
            <div>
              <label
                htmlFor="auto-submit-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Auto Submit Delay (seconds)
              </label>
              <input
                id="auto-submit-delay"
                type="number"
                min="0"
                value={preferences.autoSubmitDelay || 0}
                onChange={(e) => handleDelayChange('autoSubmit', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Delay before auto-submitting form
              </p>
            </div>

            {/* Auto Execute Delay */}
            <div>
              <label
                htmlFor="auto-execute-delay"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Auto Execute Delay (seconds)
              </label>
              <input
                id="auto-execute-delay"
                type="number"
                min="0"
                value={preferences.autoExecuteDelay || 0}
                onChange={(e) => handleDelayChange('autoExecute', e.target.value)}
                disabled={false}
                className={cn(
                  "w-full p-2 text-sm border rounded-md",
                  "bg-white dark:bg-slate-900",
                  "border-slate-300 dark:border-slate-600",
                  "text-slate-900 dark:text-slate-100"
                )}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Delay before auto-executing functions
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
