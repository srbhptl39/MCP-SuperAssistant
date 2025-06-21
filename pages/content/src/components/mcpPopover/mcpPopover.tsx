import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useCurrentAdapter, useUserPreferences, useMCPState } from '../../hooks';
import PopoverPortal from './PopoverPortal';
import { instructionsState } from '../sidebar/Instructions/InstructionManager';
import { AutomationService } from '../../services/automation.service';

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
  width: max-content;
  height: max-content;
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

/* Hover overlay styles */
.mcp-hover-overlay {
  position: fixed !important;
  background: #ffffff !important;
  border: 1px solid #e1e5e9 !important;
  border-radius: 10px !important;
  box-shadow: 0 6px 20px rgba(60,64,67,0.12), 0 2px 8px rgba(60,64,67,0.06) !important;
  padding: 8px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  align-items: stretch !important;
  opacity: 0 !important;
  visibility: hidden !important;
  transform: translateY(-8px) scale(0.95) !important;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
  z-index: 2147483647 !important;
  white-space: nowrap !important;
  pointer-events: none !important;
  width: 130px !important;
  min-width: 130px !important;
  max-width: 130px !important;
  box-sizing: border-box !important;
  font-family: inherit !important;
  font-synthesis: none !important;
  text-rendering: optimizeLegibility !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
}

.mcp-hover-overlay.visible {
  opacity: 1 !important;
  visibility: visible !important;
  transform: translateY(0) scale(1) !important;
  pointer-events: auto !important;
}

.mcp-hover-button {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  padding: 10px 12px !important;
  border-radius: 6px !important;
  border: none !important;
  background: #f8f9fa !important;
  color: #374151 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  width: 100% !important;
  min-width: 110px !important;
  max-width: none !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji" !important;
  text-align: left !important;
  letter-spacing: -0.01em !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}

.mcp-hover-button:hover {
  background: #e3f2fd !important;
  color: #1565c0 !important;
  transform: scale(1.02) !important;
  box-shadow: 0 2px 8px rgba(21, 101, 192, 0.15) !important;
}

.mcp-hover-button:active {
  transform: scale(0.98) !important;
  box-shadow: 0 1px 3px rgba(21, 101, 192, 0.2) !important;
}

@media (prefers-color-scheme: dark) {
  .mcp-hover-overlay {
    background: #1f2937 !important;
    border-color: #374151 !important;
    box-shadow: 0 8px 25px rgba(0,0,0,0.3), 0 3px 10px rgba(0,0,0,0.2) !important;
  }

  .mcp-hover-button {
    background: #374151 !important;
    color: #d1d5db !important;
  }

  .mcp-hover-button:hover {
    background: #1e3a8a !important;
    color: #93c5fd !important;
    box-shadow: 0 2px 8px rgba(147, 197, 253, 0.2) !important;
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
  /**
   * Adapter-specific button styling configuration
   * Allows adapters to override the default MCP button styling
   * to match the host website's design system
   */
  adapterButtonConfig?: {
    className?: string;        // Main button class (e.g., 'mcp-gh-button-base')
    contentClassName?: string; // Content wrapper class (e.g., 'mcp-gh-button-content')  
    textClassName?: string;    // Text label class (e.g., 'mcp-gh-button-text')
    iconClassName?: string;    // Icon class (e.g., 'mcp-gh-button-icon')
    activeClassName?: string;  // Active state class (e.g., 'mcp-button-active')
  };
  /**
   * Name of the adapter providing the styling
   * Used for debugging and logging
   */
  adapterName?: string;
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

export const MCPPopover: React.FC<MCPPopoverProps> = ({ toggleStateManager, adapterButtonConfig, adapterName }) => {
  const isDarkMode = useThemeDetector();

  // Use Zustand hooks for adapter and user preferences
  const { plugin: activePlugin, insertText, attachFile, isReady: isAdapterActive } = useCurrentAdapter();
  const { preferences, updatePreferences } = useUserPreferences();
  
  // Use MCP state hook to get persistent MCP toggle state
  const { mcpEnabled: mcpEnabledFromStore, setMCPEnabled } = useMCPState();

  // Debug: Log adapter state changes
  useEffect(() => {
    console.log(`[MCPPopover] Adapter state changed:`, {
      isAdapterActive,
      hasActivePlugin: !!activePlugin,
      pluginName: activePlugin?.name,
      hasInsertText: !!insertText,
      hasAttachFile: !!attachFile,
      capabilities: activePlugin?.capabilities,
      adapterName,
      hasAdapterButtonConfig: !!adapterButtonConfig
    });
  }, [isAdapterActive, activePlugin, insertText, attachFile, adapterName, adapterButtonConfig]);

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
  const [state, setState] = useState<MCPToggleState>(() => {
    // Initialize state with current MCP state from store
    const initialState = toggleStateManager.getState();
    return {
      ...initialState,
      mcpEnabled: mcpEnabledFromStore // Use the persistent MCP state from store
    };
  });
  // Instructions come directly from the global state (managed by Instructions panel in sidebar)
  const [instructions, setInstructions] = useState(instructionsState.instructions || '');
  const [copyStatus, setCopyStatus] = useState<'Copy' | 'Copied!' | 'Error'>('Copy');
  const [insertStatus, setInsertStatus] = useState<'Insert' | 'Inserted!' | 'No Adapter' | 'No Content' | 'Failed'>('Insert');
  const [attachStatus, setAttachStatus] = useState<'Attach' | 'Attached!' | 'No File' |'Not Supported'| 'Error'>('Attach');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isHoverOverlayVisible, setIsHoverOverlayVisible] = useState(false);
  const [hoverOverlayPosition, setHoverOverlayPosition] = useState({ x: 0, y: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoverOverlayRef = useRef<HTMLDivElement>(null);

  // Update state from manager
  const updateState = useCallback(() => {
    const currentState = toggleStateManager.getState();
    setState(prevState => ({
      ...currentState,
      mcpEnabled: mcpEnabledFromStore // Always sync with persistent MCP state from store
    }));
  }, [toggleStateManager, mcpEnabledFromStore]);

  // Sync state when MCP state changes from store (e.g., from other UI components or on page load)
  useEffect(() => {
    console.log(`[MCPPopover] MCP state changed to: ${mcpEnabledFromStore}, updating MCP toggle UI`);
    setState(prevState => {
      const newState = {
        ...prevState,
        mcpEnabled: mcpEnabledFromStore
      };
      console.log(`[MCPPopover] State updated:`, newState);
      return newState;
    });
  }, [mcpEnabledFromStore]);

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

  // Initialize and sync popover state with persistent MCP state from store
  useEffect(() => {
    // Force initial state sync to ensure popover reflects current persistent MCP state
    const currentToggleState = toggleStateManager.getState();
    console.log(`[MCPPopover] Initial state sync - toggleManager: ${currentToggleState.mcpEnabled}, store MCP: ${mcpEnabledFromStore}`);
    
    // Sync automation state from user preferences
    const syncedState = {
      ...currentToggleState,
      mcpEnabled: mcpEnabledFromStore, // Always prioritize persistent MCP state from store
      autoInsert: preferences.autoInsert || false,
      autoSubmit: preferences.autoSubmit || false,
      autoExecute: preferences.autoExecute || false,
    };
    
    setState(syncedState);
    
    // Also sync the legacy toggle state manager
    toggleStateManager.setAutoInsert(preferences.autoInsert || false);
    toggleStateManager.setAutoSubmit(preferences.autoSubmit || false);
    toggleStateManager.setAutoExecute(preferences.autoExecute || false);
  }, [toggleStateManager, mcpEnabledFromStore, preferences.autoInsert, preferences.autoSubmit, preferences.autoExecute]); // Include dependencies

  // Handlers for toggles
  const handleMCP = (checked: boolean) => {
    console.log(`[MCPPopover] MCP toggle changed to: ${checked}`);
    
    // Update the persistent MCP state in store (this will automatically control sidebar visibility)
    setMCPEnabled(checked, 'mcp-popover-user-toggle');
    
    // Also inform the legacy toggle state manager for compatibility
    toggleStateManager.setMCPEnabled(checked);
    
    // State will be updated automatically through the MCP state effect
  };

  const handleAutoInsert = (checked: boolean) => {
    console.log(`[MCPPopover] Auto Insert toggle changed to: ${checked}`);
    
    // Update user preferences store
    updatePreferences({ autoInsert: checked });
    
    // Also update legacy toggle state manager for compatibility
    toggleStateManager.setAutoInsert(checked);
    updateState();
    
    // Update automation state on window for render_prescript access
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
  };

  const handleAutoSubmit = (checked: boolean) => {
    console.log(`[MCPPopover] Auto Submit toggle changed to: ${checked}`);
    
    // Update user preferences store
    updatePreferences({ autoSubmit: checked });
    
    // Also update legacy toggle state manager for compatibility
    toggleStateManager.setAutoSubmit(checked);
    updateState();
    
    // Update automation state on window for render_prescript access
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
  };

  const handleAutoExecute = (checked: boolean) => {
    console.log(`[MCPPopover] Auto Execute toggle changed to: ${checked}`);
    
    // Update user preferences store
    updatePreferences({ autoExecute: checked });
    
    // Also update legacy toggle state manager for compatibility
    toggleStateManager.setAutoExecute(checked);
    updateState();
    
    // Update automation state on window for render_prescript access
    AutomationService.getInstance().updateAutomationStateOnWindow().catch(console.error);
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
    if (!instructions.trim()) {
      setInsertStatus('No Content');
      setTimeout(() => setInsertStatus('Insert'), 1200);
      return;
    }

    // Add more detailed debugging
    console.log(`[MCPPopover] handleInsert called - isAdapterActive: ${isAdapterActive}, activePlugin: ${!!activePlugin}, insertText: ${!!insertText}`);
    if (activePlugin) {
      console.log(`[MCPPopover] Active plugin details:`, {
        name: activePlugin.name,
        capabilities: activePlugin.capabilities,
        hasInsertText: !!activePlugin.insertText
      });
    }

    // Try with a small delay first to allow state to propagate
    if (!isAdapterActive || !activePlugin || !insertText) {
      console.log(`[MCPPopover] Adapter not immediately ready, waiting 100ms and retrying...`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (isAdapterActive && activePlugin && insertText) {
      try {
        console.log(`[MCPPopover] Attempting to insert text using ${activePlugin.name} adapter`);
        const success = await insertText(instructions);
        if (success) {
          setInsertStatus('Inserted!');
          console.log(`[MCPPopover] Text inserted successfully using ${activePlugin.name} adapter`);
        } else {
          setInsertStatus('Failed');
          console.warn(`[MCPPopover] Text insertion failed using ${activePlugin.name} adapter`);
        }
      } catch (error) {
        console.error(`[MCPPopover] Error inserting text:`, error);
        setInsertStatus('Failed');
      }
    } else {
      setInsertStatus('No Adapter');
      console.warn(`[MCPPopover] No active adapter available for text insertion. isAdapterActive: ${isAdapterActive}, activePlugin: ${!!activePlugin}, insertText: ${!!insertText}`);
      if (activePlugin) {
        console.warn(`[MCPPopover] Active plugin details:`, {
          name: activePlugin.name,
          capabilities: activePlugin.capabilities,
          hasInsertTextMethod: !!activePlugin.insertText
        });
      }
    }
    setTimeout(() => setInsertStatus('Insert'), 1200);
  };


  const handleAttach = async () => {
    // Add more detailed debugging
    console.log(`[MCPPopover] handleAttach called - isAdapterActive: ${isAdapterActive}, activePlugin: ${!!activePlugin}, attachFile: ${!!attachFile}`);
    if (activePlugin) {
      console.log(`[MCPPopover] Active plugin details for attach:`, {
        name: activePlugin.name,
        capabilities: activePlugin.capabilities,
        hasAttachFile: !!activePlugin.attachFile,
        supportsFileAttachment: activePlugin.capabilities.includes('file-attachment')
      });
    }

    if (!instructions.trim()) {
      setAttachStatus('No File');
      setTimeout(() => setAttachStatus('Attach'), 1200);
      return;
    }

    // Try with a small delay first to allow state to propagate
    if (!isAdapterActive || !activePlugin || !attachFile) {
      console.log(`[MCPPopover] Adapter not immediately ready for attachment, waiting 100ms and retrying...`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (isAdapterActive && activePlugin && attachFile) {
      if (!activePlugin.capabilities.includes('file-attachment')) {
      setAttachStatus('Not Supported');
      console.warn(`[MCPPopover] File attachment not supported by ${activePlugin.name} adapter`);
      return;
      }

      const isPerplexity = activePlugin.name === 'Perplexity';
      const isGemini = activePlugin.name === 'Gemini';
      const fileType = isPerplexity || isGemini ? 'text/plain' : 'text/markdown';
      const fileExtension = isPerplexity || isGemini ? '.txt' : '.md';
      const fileName = `mcp_superassistant_instructions${fileExtension}`;
      const file = new File([instructions], fileName, { type: fileType });
      try {
      console.log(`[MCPPopover] Attempting to attach file using ${activePlugin.name} adapter`);
      const success = await attachFile(file);
      if (success) {
        setAttachStatus('Attached!');
        console.log(`[MCPPopover] File attached successfully using ${activePlugin.name} adapter`);
      } else {
        setAttachStatus('Error');
        console.warn(`[MCPPopover] File attachment failed using ${activePlugin.name} adapter`);
      }
      } catch (error) {
      console.error(`[MCPPopover] Error attaching file:`, error);
      setAttachStatus('Error');
      }
    } else {
      setAttachStatus('No File');
      console.warn(`[MCPPopover] Cannot attach file. isAdapterActive: ${isAdapterActive}, activePlugin: ${!!activePlugin}, attachFile: ${!!attachFile}`);
      if (activePlugin) {
      console.warn(`[MCPPopover] Active plugin details:`, {
        name: activePlugin.name,
        capabilities: activePlugin.capabilities,
        hasAttachFileMethod: !!activePlugin.attachFile
      });
      }
    }
    setTimeout(() => setAttachStatus('Attach'), 1200);
  };

  // Update hover overlay position
  const updateHoverOverlayPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const overlayWidth = 130; // fixed width from CSS
      const overlayHeight = 140; // approximate height for 3 buttons
      
      // Calculate position above the button
      let x = rect.right - overlayWidth + 10; // Align to right edge with some offset
      let y = rect.top - overlayHeight - 10; // Position above with gap
      
      // Keep within viewport bounds
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Adjust horizontal position if going off screen
      if (x < 10) {
        x = 10;
      } else if (x + overlayWidth > viewportWidth - 10) {
        x = viewportWidth - overlayWidth - 10;
      }
      
      // Adjust vertical position if going off screen
      if (y < 10) {
        y = rect.bottom + 10; // Position below if not enough space above
      }
      
      setHoverOverlayPosition({ x, y });
    }
  }, []);

  // Hover overlay handlers
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    updateHoverOverlayPosition();
    setIsHoverOverlayVisible(true);
  }, [updateHoverOverlayPosition]);

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHoverOverlayVisible(false);
    }, 200);
  }, []);

  const handleHoverOverlayEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  const handleHoverOverlayLeave = () => {
    setIsHoverOverlayVisible(false);
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

  // Update hover overlay position on scroll/resize
  useEffect(() => {
    if (isHoverOverlayVisible) {
      updateHoverOverlayPosition();
      
      const handleScrollResize = () => {
        updateHoverOverlayPosition();
      };
      
      window.addEventListener('scroll', handleScrollResize, true);
      window.addEventListener('resize', handleScrollResize);
      
      return () => {
        window.removeEventListener('scroll', handleScrollResize, true);
        window.removeEventListener('resize', handleScrollResize);
      };
    }
    return undefined;
  }, [isHoverOverlayVisible, updateHoverOverlayPosition]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Derived disabled states
  const autoInsertDisabled = !state.mcpEnabled;
  const autoSubmitDisabled = !state.mcpEnabled || !state.autoInsert;
  const autoExecuteDisabled = !state.mcpEnabled;

  // Determine button styling based on adapter configuration
  const buttonClassName = adapterButtonConfig?.className
    ? `${adapterButtonConfig.className}${state.mcpEnabled && adapterButtonConfig.activeClassName ? ` ${adapterButtonConfig.activeClassName}` : ''}`
    : `mcp-main-button${state.mcpEnabled ? '' : ' inactive'}`;

  const buttonContent = adapterButtonConfig?.contentClassName ? (
    <span className={adapterButtonConfig.contentClassName}>
      <img 
        src={chrome.runtime.getURL('icon-34.png')} 
        alt="MCP Logo" 
        className={adapterButtonConfig.iconClassName || ''}
        style={{ width: '20px', height: '20px', borderRadius: '50%' }}
      />
      <span className={adapterButtonConfig.textClassName || ''}>MCP</span>
    </span>
  ) : (
    <>
      <img 
        src={chrome.runtime.getURL('icon-34.png')} 
        alt="MCP Logo" 
        style={{ width: '20px', height: '20px', marginRight: '1px', verticalAlign: 'middle', borderRadius: '50%' }}
      />
      MCP
    </>
  );

  return (
    <div className="mcp-popover-container" id="mcp-popover-container" ref={containerRef}>
      <div 
        style={{ position: 'relative', display: 'inline-block' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          className={buttonClassName}
          aria-label={`MCP Settings - ${state.mcpEnabled ? 'Active' : 'Inactive'}`}
          title={`MCP Settings - ${state.mcpEnabled ? 'Sidebar Visible' : 'Sidebar Hidden'}`}
          type="button"
          ref={buttonRef}
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}>
          {buttonContent}
        </button>
      </div>
      
      {/* Hover overlay portal */}
      {isHoverOverlayVisible && createPortal(
        <div 
          className={`mcp-hover-overlay ${isHoverOverlayVisible ? 'visible' : ''}`}
          ref={hoverOverlayRef}
          onMouseEnter={handleHoverOverlayEnter}
          onMouseLeave={handleHoverOverlayLeave}
          style={{
            left: `${hoverOverlayPosition.x}px`,
            top: `${hoverOverlayPosition.y}px`,
          }}
        >
          <button
            className="mcp-hover-button"
            onClick={handleInsert}
            title="Insert instructions"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            Insert
          </button>
          <button
            className="mcp-hover-button"
            onClick={handleAttach}
            title="Attach instructions as file"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
            </svg>
            Attach
          </button>
          <button
            className="mcp-hover-button"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            title="Configure MCP settings"
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
            Configure
          </button>
        </div>,
        document.body
      )}
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
