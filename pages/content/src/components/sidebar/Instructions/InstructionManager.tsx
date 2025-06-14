import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateInstructions } from './instructionGenerator';
import { useUserPreferences } from '../../../hooks';
import { Typography } from '../ui';
import { cn } from '@src/lib/utils';
import { logMessage } from '@src/utils/helpers';

// Create a global shared state for instructions
export const instructionsState = {
  instructions: '',
  updating: false, // Flag to prevent circular updates
  setInstructions: (newInstructions: string) => {
    // Don't update if the value hasn't changed
    if (instructionsState.instructions === newInstructions) {
      return;
    }

    // Set flag to prevent circular updates
    instructionsState.updating = true;
    instructionsState.instructions = newInstructions;

    // Call all registered listeners when instructions change
    instructionsState.listeners.forEach(listener => listener(newInstructions));

    // Reset flag after all listeners have been called
    setTimeout(() => {
      instructionsState.updating = false;
    }, 0);
  },
  listeners: [] as ((instructions: string) => void)[],
  subscribe: (listener: (instructions: string) => void) => {
    instructionsState.listeners.push(listener);
    return () => {
      instructionsState.listeners = instructionsState.listeners.filter(l => l !== listener);
    };
  },
};

interface InstructionManagerProps {
  adapter: any;
  tools: Array<{ name: string; schema: string; description: string }>;
}

// Button component for consistent styling
interface ActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  success?: boolean;
  color: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'slate';
  label: string;
}

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, disabled, loading, success, color, label }) => {
  const colorClasses = {
    blue: 'text-blue-700 dark:text-blue-500 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-800/40',
    green:
      'text-green-700 dark:text-green-500 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/40',
    red: 'text-red-700 dark:text-red-500 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/40',
    amber:
      'text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40',
    purple:
      'text-purple-700 dark:text-purple-500 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-800/40',
    slate: 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'px-2 py-1 text-xs font-medium rounded transition-colors w-[70px] text-center',
        disabled || loading ? colorClasses.slate : colorClasses[color],
      )}>
      {loading ? `${label}...` : success ? `${label} ✓` : label}
    </button>
  );
};

const InstructionManager: React.FC<InstructionManagerProps> = ({ adapter, tools }) => {
  // Use Zustand hooks for user preferences
  const { preferences, updatePreferences } = useUserPreferences();

  const [instructions, setInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [attachSuccess, setAttachSuccess] = useState(false);

  // Custom instructions state - get from preferences
  const [customInstructions, setCustomInstructions] = useState(preferences.customInstructions || '');
  const [customInstructionsEnabled, setCustomInstructionsEnabled] = useState(preferences.customInstructionsEnabled || false);
  const [isEditingCustom, setIsEditingCustom] = useState(false);

  // Memoize tools to prevent unnecessary regeneration
  const toolsSignature = useMemo(() => {
    return tools.map(tool => tool.name).join(',');
  }, [tools]);

  // Update local state when preferences change
  useEffect(() => {
    setCustomInstructions(preferences.customInstructions || '');
    setCustomInstructionsEnabled(preferences.customInstructionsEnabled || false);
  }, [preferences]);

  // Generate instructions with custom instructions
  const generateCurrentInstructions = useCallback(() => {
    return generateInstructions(tools, customInstructions, customInstructionsEnabled);
  }, [tools, customInstructions, customInstructionsEnabled]);

  // Update instructions when tools or custom instructions change
  useEffect(() => {
    if (tools.length > 0) {
      logMessage('Generating instructions based on updated tools and custom instructions');
      const newInstructions = generateCurrentInstructions();
      setInstructions(newInstructions);
      // Update global state
      instructionsState.setInstructions(newInstructions);
    }

    return () => {
      logMessage('Cleaning up instruction generator effect');
    };
  }, [toolsSignature, customInstructions, customInstructionsEnabled, generateCurrentInstructions]);

  // Update global state when local state changes
  useEffect(() => {
    // Don't update if we're in the middle of a global state update
    if (instructionsState.updating) {
      return;
    }

    // Update global state
    if (instructionsState.instructions !== instructions) {
      instructionsState.setInstructions(instructions);
    }
  }, [instructions]);

  // Update local state when global state changes (sync with MCPPopover)
  useEffect(() => {
    const unsubscribe = instructionsState.subscribe(newInstructions => {
      // Only update local state if it's different from current instructions
      if (newInstructions !== instructions) {
        setInstructions(newInstructions);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [instructions]);

  const handleInsertInChat = useCallback(async () => {
    if (!instructions) return;

    setIsInserting(true);
    setInsertSuccess(false);
    try {
      logMessage('Inserting instructions into chat');
      adapter.insertTextIntoInput(instructions);
      setInsertSuccess(true);
      setTimeout(() => setInsertSuccess(false), 2000);
    } catch (error) {
      console.error('Error inserting instructions:', error);
    } finally {
      setIsInserting(false);
    }
  }, [adapter, instructions]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!instructions) return;

    setIsCopying(true);
    setCopySuccess(false);
    try {
      logMessage('Copying instructions to clipboard');
      await navigator.clipboard.writeText(instructions);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying instructions to clipboard:', error);
    } finally {
      setIsCopying(false);
    }
  }, [instructions]);

  const handleAttachAsFile = useCallback(async () => {
    if (!instructions || !adapter.supportsFileUpload()) return;

    setIsAttaching(true);
    setAttachSuccess(false);
    try {
      const isPerplexity = adapter.name === 'Perplexity';
      const isGemini = adapter.name === 'Gemini';
      const fileType = isPerplexity || isGemini ? 'text/plain' : 'text/markdown';
      const fileExtension = isPerplexity || isGemini ? '.txt' : '.md';
      const fileName = `instructions${fileExtension}`;

      logMessage(`Attaching instructions as ${fileName}`);
      const file = new File([instructions], fileName, { type: fileType });
      await adapter.attachFile(file);
      setAttachSuccess(true);
      setTimeout(() => setAttachSuccess(false), 2000);
    } catch (error) {
      console.error('Error attaching instructions as file:', error);
    } finally {
      setIsAttaching(false);
    }
  }, [adapter, instructions]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    // Update global state
    instructionsState.setInstructions(instructions);
  }, [instructions]);

  const handleCancel = useCallback(() => {
    const originalInstructions = generateCurrentInstructions();
    setInstructions(originalInstructions);
    // Update global state
    instructionsState.setInstructions(originalInstructions);
    setIsEditing(false);
  }, [generateCurrentInstructions]);

  // Custom instructions handlers
  const handleCustomInstructionsToggle = useCallback(async (enabled: boolean) => {
    setCustomInstructionsEnabled(enabled);
    try {
      updatePreferences({ customInstructionsEnabled: enabled });
      logMessage(`Custom instructions ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      logMessage(`Error saving custom instructions toggle: ${error}`);
    }
  }, [updatePreferences]);

  const handleCustomInstructionsSave = useCallback(async () => {
    setIsEditingCustom(false);
    try {
      updatePreferences({ customInstructions });
      logMessage('Custom instructions saved');
    } catch (error) {
      logMessage(`Error saving custom instructions: ${error}`);
    }
  }, [customInstructions, updatePreferences]);

  const handleCustomInstructionsCancel = useCallback(() => {
    setCustomInstructions(preferences.customInstructions || '');
    setIsEditingCustom(false);
  }, [preferences]);

  return (
    <div className="space-y-3">
      {/* Custom Instructions Panel */}
      <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 sidebar-card">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Typography variant="h4" className="text-slate-700 dark:text-slate-300">
              Custom Instructions
            </Typography>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={customInstructionsEnabled}
                onChange={e => handleCustomInstructionsToggle(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400">Enable</span>
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            {isEditingCustom ? (
              <>
                <ActionButton onClick={handleCustomInstructionsSave} color="green" label="Save" />
                <ActionButton onClick={handleCustomInstructionsCancel} color="red" label="Cancel" />
              </>
            ) : (
              <ActionButton
                onClick={() => setIsEditingCustom(true)}
                color="blue"
                label="Edit"
                disabled={!customInstructionsEnabled}
              />
            )}
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900">
          {isEditingCustom ? (
            <textarea
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder="Enter your custom instructions here..."
              className="w-full h-32 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200"
            />
          ) : (
            <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
              {customInstructionsEnabled && customInstructions ? (
                <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded overflow-x-auto text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {customInstructions}
                </pre>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400 italic p-3">
                  {customInstructionsEnabled ? 'No custom instructions set' : 'Custom instructions disabled'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Instructions Panel */}
      <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 sidebar-card">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <Typography variant="h4" className="text-slate-700 dark:text-slate-300">
            Instructions
          </Typography>
          <div className="flex items-center gap-1.5">
            {isEditing ? (
              <>
                <ActionButton onClick={handleSave} color="green" label="Save" />
                <ActionButton onClick={handleCancel} color="red" label="Cancel" />
              </>
            ) : (
              <>
                <ActionButton onClick={() => setIsEditing(true)} color="blue" label="Edit" />
                {/* <ActionButton 
                  onClick={handleCopyToClipboard} 
                  loading={isCopying}
                  success={copySuccess}
                  color="amber" 
                  label="Copy" 
                />
                <ActionButton 
                  onClick={handleInsertInChat} 
                  loading={isInserting}
                  success={insertSuccess}
                  color="green" 
                  label="Insert" 
                />
                <ActionButton 
                  onClick={handleAttachAsFile} 
                  loading={isAttaching}
                  success={attachSuccess}
                  disabled={!adapter.supportsFileUpload()} 
                  color="purple" 
                  label="Attach" 
                /> */}
              </>
            )}
          </div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-900">
          {isEditing ? (
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full h-64 p-2 text-sm font-mono border border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200"
            />
          ) : (
            <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent">
              <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded overflow-x-auto text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {instructions}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstructionManager;
