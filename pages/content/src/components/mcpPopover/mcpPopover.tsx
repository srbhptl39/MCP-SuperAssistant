import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useCurrentAdapter, useUserPreferences } from '../../hooks';
import PopoverPortal from './PopoverPortal';
import { instructionsState } from '../sidebar/Instructions/InstructionManager';

export interface MCPToggleState {
  mcpEnabled: boolean;
  autoInsert: boolean;
  autoSubmit: boolean;
  autoExecute: boolean;
}

// Hook to detect dark mode
const useThemeDetector = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isDarkMode;
};

// CSS for the component using the provided color scheme
const styles = `
.mcp-popover-container {
  position: relative;
  display: inline-block;
}

.mcp-main-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 10px;
  background-color: #e8f0fe;
  border: 1px solid #dadce0;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #202124;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(60,64,67,0.08);
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.mcp-main-button:hover {
  background-color: #aecbfa;
  box-shadow: 0 2px 4px rgba(60,64,67,0.12);
}

.mcp-main-button:active {
  transform: translateY(1px);
  box-shadow: 0 0 1px rgba(60,64,67,0.08);
}

.mcp-main-button.inactive {
  background-color: #f5f7f9;
  border-color: #dadce0;
  color: #5f6368;
}

.mcp-popover {
  width: 650px;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(60,64,67,0.10), 0 2px 8px rgba(60,64,67,0.06);
  padding: 0;
  z-index: 1000;
  border: 1px solid #dadce0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  overflow: visible;
  max-height: 90vh;
  position: relative;
}

.mcp-close-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  border: none;
  color: #5f6368;
  font-size: 18px;
  font-weight: 500;
  z-index: 1002;
  transition: all 0.2s ease;
}

.mcp-close-button:hover {
  background-color: #e8f0fe;
  color: #1a73e8;
}

.mcp-close-button:active {
  transform: scale(0.95);
}

/* Default arrow (positioned at the bottom for popover above trigger) */
.mcp-popover.position-above::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 14px;
  height: 14px;
  background-color: #ffffff;
  border-right: 1px solid #dadce0;
  border-bottom: 1px solid #dadce0;
}

/* Arrow for popover positioned below the trigger */
.mcp-popover.position-below::after {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%) rotate(-135deg);
  width: 14px;
  height: 14px;
  background-color: #ffffff;
  border-right: 1px solid #dadce0;
  border-bottom: 1px solid #dadce0;
}

.mcp-toggle-item {
  display: block;
  margin-bottom: 6px;
  padding: 8px 10px;
  cursor: pointer;
  border-bottom: 1px solid #dadce0;
  transition: background-color 0.15s ease;
  box-sizing: border-box;
  width: 100%;
  background: #ffffff;
}

.mcp-toggle-item:hover {
  background-color: #e8f0fe;
}

.mcp-toggle-item:last-child {
  margin-bottom: 0;
  border-bottom: none;
}

.mcp-toggle-checkbox {
  position: relative;
  width: 36px;
  height: 18px;
  flex-shrink: 0;
  display: inline-block;
  margin-right: 10px;
  vertical-align: middle;
  border-radius: 34px;
  
}

.mcp-toggle-checkbox input {
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;
  padding: 0;
}

.mcp-toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #dadce0;
  transition: .3s;
  border-radius: 34px;
  box-sizing: border-box;
  overflow: hidden;
}

.mcp-toggle-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  transition: .3s;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(60,64,67,0.08);
  z-index: 1;
}

input:checked + .mcp-toggle-slider {
  background-color: #1a73e8;
}

input:checked + .mcp-toggle-slider:before {
  transform: translateX(18px);
}

.mcp-toggle-label {
  font-size: 13px;
  color: #202124;
  font-weight: 500;
  letter-spacing: 0.2px;
  white-space: nowrap;
  vertical-align: middle;
}

.mcp-toggle-item.disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background-color: #f5f7f9;
}

.mcp-toggle-item.disabled .mcp-toggle-slider {
  background-color: #dadce0;
  cursor: not-allowed;
  border-radius: 34px;
  overflow: hidden;
}

.mcp-instruction-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px rgba(60,64,67,0.05);
}

.mcp-instruction-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(60,64,67,0.10);
}

.mcp-instruction-btn:active {
  transform: translateY(0);
}

.mcp-instructions-container {
  background-color: #f8f9fa;
  border: 1px solid #eaecef;
  border-radius: 10px;
  padding: 16px;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  color: #3c4043;
  box-shadow: inset 0 1px 2px rgba(60,64,67,0.03);
  width: 100%;
  box-sizing: border-box;
  overflow-wrap: break-word;
}

.mcp-popover {
  position: relative;
}

.mcp-drag-handle {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 6px;
  cursor: move;
  z-index: 1001;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background-color: #dadce0;
  border-bottom-left-radius: 3px;
  border-bottom-right-radius: 3px;
  border: none;
}

.mcp-drag-handle:hover {
  background-color: #e8f0fe;
}

.mcp-drag-handle:hover .mcp-drag-handle-bar {
  background-color: #1a73e8;
}

.mcp-drag-handle-bar {
  width: 12px;
  height: 3px;
  background-color: #5f6368;
  border-radius: 1.5px;
  margin: 0 1px;
  transition: background-color 0.2s ease;
}

@media (prefers-color-scheme: dark) {
  .mcp-main-button {
    background-color: #174ea6;
    border-color: #8ab4f8;
    color: #e8eaed;
  }

  .mcp-main-button:hover {
    background-color: #8ab4f8;
    color: #202124;
  }

  .mcp-main-button.inactive {
    background-color: #2d2d2d;
    border-color: #444;
    color: #9aa0a6;
  }

  .mcp-popover {
    background-color: #2d2d2d;
    box-shadow: 0 4px 20px rgba(20,20,20,0.25), 0 2px 8px rgba(20,20,20,0.15);
    border: 1px solid #444;
    overflow: visible;
  }

  .mcp-popover.position-above::after,
  .mcp-popover.position-below::after {
    background-color: #2d2d2d;
    border-right: 1px solid #444;
    border-bottom: 1px solid #444;
  }

  .mcp-toggle-item {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    border-bottom: 1px solid #444;
    background: #2d2d2d;
  }

  .mcp-toggle-item:hover {
    background-color: #174ea6;
  }

  .mcp-toggle-slider {
    background-color: #444;
  }

  input:checked + .mcp-toggle-slider {
    background-color: #8ab4f8;
  }

  .mcp-toggle-label {
    color: #e8eaed;
  }

  .mcp-toggle-item.disabled {
    background-color: #282828;
  }

  .mcp-toggle-item.disabled .mcp-toggle-slider {
    background-color: #444;
    border-radius: 34px;
    overflow: hidden;
  }

  .mcp-instructions-container {
    background-color: #2d2d2d;
    border: 1px solid #444;
    color: #e8eaed;
    box-shadow: inset 0 1px 2px rgba(20,20,20,0.10);
  }

  .mcp-close-button {
    color: #9aa0a6;
  }

  .mcp-close-button:hover {
    background-color: #174ea6;
    color: #8ab4f8;
  }
  
  .mcp-drag-handle {
    background-color: #444;
    border: none;
  }

  .mcp-drag-handle-bar {
    background-color: #9aa0a6;
  }
  
  .mcp-drag-handle:hover {
    background-color: #174ea6;
  }

  .mcp-drag-handle:hover .mcp-drag-handle-bar {
    background-color: #8ab4f8;
  }
}
`;
function useInjectStyles() {
  useEffect(() => {
    if (!document.getElementById('mcp-popover-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'mcp-popover-styles';
      styleEl.textContent = styles;
      document.head.appendChild(styleEl);
    }
  }, []);
}

interface MCPPopoverProps {
  toggleStateManager: {
    getState(): MCPToggleState;
    setMCPEnabled(enabled: boolean): void;
    setAutoInsert(enabled: boolean): void;
    setAutoSubmit(enabled: boolean): void;
    setAutoExecute(enabled: boolean): void;
    updateUI(): void;
  };
}

interface ToggleItemProps {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleItem: React.FC<ToggleItemProps> = ({ id, label, checked, disabled, onChange }) => {
  const isDarkMode = useThemeDetector();

  // Color scheme for toggles
  const toggleTheme = {
    itemBackground: isDarkMode ? '#2d2d2d' : '#ffffff',
    itemBackgroundHover: isDarkMode ? '#174ea6' : '#e8f0fe',
    itemBorderColor: isDarkMode ? '#444' : '#dadce0',
    labelColor: isDarkMode ? '#e8eaed' : '#202124',
    toggleBackground: isDarkMode ? '#444' : '#dadce0',
    toggleBackgroundChecked: isDarkMode ? '#8ab4f8' : '#1a73e8',
    toggleBackgroundDisabled: isDarkMode ? '#444' : '#dadce0',
  };

  return (
    <div
      className={`mcp-toggle-item${disabled ? ' disabled' : ''}`}
      style={{
        borderBottom: `1px solid ${toggleTheme.itemBorderColor}`,
        backgroundColor: toggleTheme.itemBackground,
      }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}>
        <div style={{ width: '36px', marginRight: '10px' }}>
          <label className="mcp-toggle-checkbox" style={{ display: 'block' }}>
            <input
              type="checkbox"
              id={id}
              checked={checked}
              disabled={disabled}
              onChange={e => onChange(e.target.checked)}
            />
            <span
              className="mcp-toggle-slider"
              style={{
                backgroundColor: disabled
                  ? toggleTheme.toggleBackgroundDisabled
                  : checked
                    ? toggleTheme.toggleBackgroundChecked
                    : toggleTheme.toggleBackground,
              }}></span>
          </label>
        </div>
        <label
          htmlFor={id}
          className="mcp-toggle-label"
          style={{
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: toggleTheme.labelColor,
          }}>
          {label}
        </label>
      </div>
    </div>
  );
};

export const MCPPopover: React.FC<MCPPopoverProps> = ({ toggleStateManager }) => {
  const isDarkMode = useThemeDetector();

  // Use Zustand hooks for adapter and user preferences
  const { plugin: activePlugin, insertText, attachFile, isReady: isAdapterActive } = useCurrentAdapter();
  const { preferences } = useUserPreferences();

  // Debug: Log instructions state for debugging
  useEffect(() => {
    console.log(`[MCPPopover] Instructions state:`, {
      hasInstructions: !!instructionsState.instructions,
      instructionsLength: instructionsState.instructions.length,
      preferences: preferences
    });
  }, [instructionsState.instructions, preferences]);

  // Color scheme for the popover
  const theme = {
    // Background colors
    mainBackground: isDarkMode ? '#2d2d2d' : '#ffffff',
    secondaryBackground: isDarkMode ? '#2d2d2d' : '#f8f9fa',
    buttonBackground: isDarkMode ? '#174ea6' : '#e8f0fe',
    buttonBackgroundHover: isDarkMode ? '#8ab4f8' : '#aecbfa',
    buttonBackgroundActive: isDarkMode ? '#8ab4f8' : '#1a73e8',
    toggleBackground: isDarkMode ? '#444' : '#dadce0',
    toggleBackgroundChecked: isDarkMode ? '#8ab4f8' : '#1a73e8',
    toggleBackgroundDisabled: isDarkMode ? '#444' : '#dadce0',

    // Text colors
    primaryText: isDarkMode ? '#e8eaed' : '#202124',
    secondaryText: isDarkMode ? '#9aa0a6' : '#5f6368',
    disabledText: isDarkMode ? '#9aa0a6' : '#5f6368',

    // Border colors
    borderColor: isDarkMode ? '#444' : '#dadce0',
    dividerColor: isDarkMode ? '#444' : '#dadce0',

    // Shadow
    boxShadow: isDarkMode
      ? '0 6px 24px rgba(20,20,20,0.25), 0 2px 8px rgba(20,20,20,0.15)'
      : '0 6px 24px rgba(60,64,67,0.10), 0 2px 8px rgba(60,64,67,0.06)',
    innerShadow: isDarkMode ? 'inset 0 1px 2px rgba(20,20,20,0.10)' : 'inset 0 1px 2px rgba(60,64,67,0.03)',
  };
  useInjectStyles();
  const [state, setState] = useState<MCPToggleState>(toggleStateManager.getState());
  // Instructions come directly from the global state (managed by Instructions panel in sidebar)
  const [instructions, setInstructions] = useState(instructionsState.instructions || '');
  const [copyStatus, setCopyStatus] = useState<'Copy' | 'Copied!' | 'Error'>('Copy');
  const [insertStatus, setInsertStatus] = useState<'Insert' | 'Inserted!' | 'No Adapter'>('Insert');
  const [attachStatus, setAttachStatus] = useState<'Attach' | 'Attached!' | 'No File' | 'Error'>('Attach');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Update state from manager
  const updateState = useCallback(() => {
    setState(toggleStateManager.getState());
  }, [toggleStateManager]);

  // Subscribe to global instructions state changes (Instructions panel is source of truth)
  useEffect(() => {
    // Initial sync
    setInstructions(instructionsState.instructions || '');
    
    // Subscribe to changes in the global instructions state
    const unsubscribe = instructionsState.subscribe(newInstructions => {
      setInstructions(newInstructions);
    });

    // Clean up subscription on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  // Handlers for toggles
  const handleMCP = (checked: boolean) => {
    toggleStateManager.setMCPEnabled(checked);
    updateState();
  };
  const handleAutoInsert = (checked: boolean) => {
    toggleStateManager.setAutoInsert(checked);
    updateState();
  };
  const handleAutoSubmit = (checked: boolean) => {
    toggleStateManager.setAutoSubmit(checked);
    updateState();
  };
  const handleAutoExecute = (checked: boolean) => {
    toggleStateManager.setAutoExecute(checked);
    updateState();
  };

  // Action buttons
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus('Copy'), 1200);
    } catch {
      setCopyStatus('Error');
      setTimeout(() => setCopyStatus('Copy'), 1200);
    }
  };
  const handleInsert = async () => {
    if (isAdapterActive && activePlugin) {
      try {
        const success = await insertText(instructions);
        if (success) {
          setInsertStatus('Inserted!');
        } else {
          setInsertStatus('No Adapter');
        }
      } catch (error) {
        setInsertStatus('No Adapter');
      }
    } else {
      setInsertStatus('No Adapter');
    }
    setTimeout(() => setInsertStatus('Insert'), 1200);
  };
  const handleAttach = async () => {
    if (isAdapterActive && activePlugin && activePlugin.capabilities.includes('file-attachment')) {
      const isPerplexity = activePlugin.name === 'Perplexity';
      const isGemini = activePlugin.name === 'Gemini';
      const fileType = isPerplexity || isGemini ? 'text/plain' : 'text/markdown';
      const fileExtension = isPerplexity || isGemini ? '.txt' : '.md';
      const fileName = `mcp_superassistant_instructions${fileExtension}`;
      const file = new File([instructions], fileName, { type: fileType });
      try {
        const success = await attachFile(file);
        if (success) {
          setAttachStatus('Attached!');
        } else {
          setAttachStatus('Error');
        }
      } catch {
        setAttachStatus('Error');
      }
    } else {
      setAttachStatus('No File');
    }
    setTimeout(() => setAttachStatus('Attach'), 1200);
  };

  // Popover show/hide logic
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is outside both the button and the popover
      const isButtonClick = buttonRef.current && buttonRef.current.contains(e.target as Node);
      const isPopoverClick = popoverRef.current && popoverRef.current.contains(e.target as Node);
      const isPortalClick = document.getElementById('mcp-popover-portal')?.contains(e.target as Node);

      if (!isButtonClick && !isPopoverClick && !isPortalClick) {
        setIsPopoverOpen(false);
      }
    };

    if (isPopoverOpen) {
      // Add a slight delay to avoid immediate trigger
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 10);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopoverOpen]);

  // Derived disabled states
  const autoInsertDisabled = !state.mcpEnabled;
  const autoSubmitDisabled = !state.mcpEnabled || !state.autoInsert;
  const autoExecuteDisabled = !state.mcpEnabled;

  return (
    <div className="mcp-popover-container" id="mcp-popover-container" ref={containerRef}>
      <button
        className={`mcp-main-button${state.mcpEnabled ? '' : ' inactive'}`}
        aria-label="MCP Settings"
        title="MCP Settings"
        type="button"
        ref={buttonRef}
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}>
        MCP
      </button>
      <PopoverPortal isOpen={isPopoverOpen} triggerRef={buttonRef}>
        <div
          className="mcp-popover position-above"
          ref={popoverRef}
          style={{
            display: 'flex',
            flexDirection: 'row',
            minHeight: 280,
            padding: 0,
            width: '650px',
            position: 'relative',
            borderRadius: '16px',
            boxShadow: theme.boxShadow,
            overflow: 'hidden',
            backgroundColor: theme.mainBackground,
            border: `1px solid ${theme.borderColor}`,
          }}>
          <button
            className="mcp-close-button"
            onClick={() => setIsPopoverOpen(false)}
            aria-label="Close"
            title="Close"
            type="button"
            style={{
              color: theme.secondaryText,
            }}>
            ✕
          </button>
          {/* Toggles column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 160,
              padding: '20px 12px',
              gap: 12,
              borderRight: `1px solid ${theme.dividerColor}`,
              background: theme.mainBackground,
              boxSizing: 'border-box',
            }}>
            <ToggleItem id="mcp-toggle" label="MCP" checked={state.mcpEnabled} disabled={false} onChange={handleMCP} />
            <ToggleItem
              id="auto-insert-toggle"
              label="Auto Insert"
              checked={state.autoInsert}
              disabled={autoInsertDisabled}
              onChange={handleAutoInsert}
            />
            <ToggleItem
              id="auto-submit-toggle"
              label="Auto Submit"
              checked={state.autoSubmit}
              disabled={autoSubmitDisabled}
              onChange={handleAutoSubmit}
            />
            <ToggleItem
              id="auto-execute-toggle"
              label="Auto Execute"
              checked={state.autoExecute}
              disabled={autoExecuteDisabled}
              onChange={handleAutoExecute}
            />
          </div>
          {/* Instruction panel column */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '20px 20px 16px 20px',
              background: theme.mainBackground,
              boxSizing: 'border-box',
              overflow: 'auto',
            }}>
            <div
              style={{
                fontWeight: '600',
                fontSize: 16,
                marginBottom: 16,
                letterSpacing: 0.5,
                color: theme.primaryText,
                paddingBottom: 4,
                borderBottom: `1px solid ${theme.dividerColor}`,
              }}>
              Instructions
            </div>
            <div
              className="mcp-instructions-container"
              style={{
                flex: 1,
                minHeight: 180,
                maxHeight: 320,
                overflowY: 'auto',
                overflowX: 'auto',
                margin: '0 0 20px 0',
                whiteSpace: 'pre-wrap',
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: theme.secondaryBackground,
                color: theme.primaryText,
                border: `1px solid ${theme.borderColor}`,
                boxShadow: theme.innerShadow,
              }}>
              {instructions || (
                <div style={{ 
                  color: theme.secondaryText, 
                  fontStyle: 'italic',
                  padding: '10px',
                  textAlign: 'center' 
                }}>
                  {!instructionsState.instructions 
                    ? 'Loading instructions...' 
                    : 'Generating instructions...'
                  }
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 20,
                justifyContent: 'space-between',
                width: '100%',
                marginTop: 0,
                marginBottom: 16,
                paddingRight: 16,
              }}>
              <button
                className="mcp-instruction-btn"
                style={{
                  flex: 1,
                  padding: '12px 0',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: `1px solid ${theme.borderColor}`,
                  background: theme.secondaryBackground,
                  cursor: 'pointer',
                  color: theme.primaryText,
                }}
                onClick={handleCopy}
                onMouseEnter={e => (e.currentTarget.style.background = theme.buttonBackground)}
                onMouseLeave={e => (e.currentTarget.style.background = theme.secondaryBackground)}
                type="button">
                {copyStatus}
              </button>
              <button
                className="mcp-instruction-btn"
                style={{
                  flex: 1,
                  padding: '12px 0',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: `1px solid ${theme.borderColor}`,
                  background: theme.secondaryBackground,
                  cursor: 'pointer',
                  color: theme.primaryText,
                }}
                onClick={handleInsert}
                onMouseEnter={e => (e.currentTarget.style.background = theme.buttonBackground)}
                onMouseLeave={e => (e.currentTarget.style.background = theme.secondaryBackground)}
                type="button">
                {insertStatus}
              </button>
              <button
                className="mcp-instruction-btn"
                style={{
                  flex: 1,
                  padding: '12px 0',
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 8,
                  border: `1px solid ${theme.borderColor}`,
                  background: theme.secondaryBackground,
                  cursor: 'pointer',
                  color: theme.primaryText,
                }}
                onClick={handleAttach}
                onMouseEnter={e => (e.currentTarget.style.background = theme.buttonBackground)}
                onMouseLeave={e => (e.currentTarget.style.background = theme.secondaryBackground)}
                type="button">
                {attachStatus}
              </button>
            </div>
          </div>
        </div>
      </PopoverPortal>
    </div>
  );
};

export default MCPPopover;
