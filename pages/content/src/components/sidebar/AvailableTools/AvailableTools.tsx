import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import type { Tool } from '@src/types/mcp';
import { useAvailableTools, useToolExecution, useToolEnablement } from '../../../hooks';
import { logMessage } from '@src/utils/helpers';
import { Icon } from '../ui';
import { cn } from '@src/lib/utils';
import { createLogger } from '@extension/shared/lib/logger';
import { META_TOOLS } from '@src/core/metaTools';


const logger = createLogger('AvailableTools');

interface ExtendedTool extends Tool {
  displayName?: string;
  originalName?: string;
}


interface AvailableToolsProps {
  tools: Tool[];
  onExecute: (tool: Tool) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

interface ToolItemProps {
  tool: ExtendedTool;
  isEnabled: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
}

const EXPANDED_GROUPS_KEY = 'mcpSuperAssistant.expandedToolGroups';

const loadExpandedGroups = (): Set<string> => {
  try {
    const raw = localStorage.getItem(EXPANDED_GROUPS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
};

// Single tool row + expandable schema detail. Local to this file only.
const ToolItem: React.FC<ToolItemProps> = ({ tool, isEnabled, expanded, onToggleExpand, onToggleEnabled }) => {
  const displayName = tool.displayName || tool.name;

  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-150 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={onToggleExpand}>
        <Icon
          name="chevron-right"
          size="sm"
          className={cn('text-slate-400 transition-transform', expanded ? 'rotate-90' : '')}
        />
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={e => {
            e.stopPropagation();
            onToggleEnabled();
          }}
          onClick={e => e.stopPropagation()}
          className="h-4 w-4 rounded accent-indigo-600"
        />
        <span
          className={cn(
            'text-sm',
            isEnabled ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500',
          )}>
          {displayName}
        </span>
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/40">
          {tool.description && (
            <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">{tool.description}</p>
          )}
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">Schema</div>
          <pre className="text-[11px] font-mono p-2 rounded-md max-h-48 overflow-y-auto whitespace-pre-wrap bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
            {(() => {
              try {
                const schema = (tool as any).schema || (tool as any).input_schema;
                if (!schema) return 'No schema available';

                const schemaObject = typeof schema === 'string' ? JSON.parse(schema) : schema;
                return JSON.stringify(schemaObject, null, 2);
              } catch (error) {
                logger.error('Error processing tool schema:', error);
                const schema = (tool as any).schema || (tool as any).input_schema;
                return typeof schema === 'string' ? schema : 'Invalid schema format';
              }
            })()}
          </pre>
        </div>
      )}
    </div>
  );
};

const AvailableTools: React.FC<AvailableToolsProps> = ({ tools, onExecute, onRefresh, isRefreshing }) => {
  // Use Zustand hooks for tool management
  const { tools: storeTools } = useAvailableTools();
  const { executions, isExecuting } = useToolExecution();
  const { enabledTools, enableTool, disableTool, enableAllTools, disableAllTools, isToolEnabled, loadToolEnablementState, isLoadingEnablement } = useToolEnablement();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(loadExpandedGroups);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use tools from store if available, fallback to props
  const effectiveTools = storeTools.length > 0 ? storeTools : tools;

  // Memoize effective tools length to prevent excessive logging
  const effectiveToolsCount = useMemo(() => effectiveTools.length, [effectiveTools.length]);

  // Reduced debug logging - only log when tool count changes significantly
  useEffect(() => {
    if (effectiveToolsCount > 0) {
      logMessage(`[AvailableTools] ${effectiveToolsCount} tools available`);
    }
  }, [effectiveToolsCount]);

  // Mark component as loaded after initial render
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoaded(true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, []);

  // Load tool enablement state on component mount
  useEffect(() => {
    if (effectiveTools.length > 0) {
      loadToolEnablementState();
    }
  }, [effectiveTools.length, loadToolEnablementState]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const toggleToolExpansion = (toolName: string) => {
    const newExpandedTools = new Set(expandedTools);
    if (newExpandedTools.has(toolName)) {
      newExpandedTools.delete(toolName);
    } else {
      newExpandedTools.add(toolName);
    }
    setExpandedTools(newExpandedTools);
  };

  const toggleGroupExpansion = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupName) ? next.delete(groupName) : next.add(groupName);
      try {
        localStorage.setItem(EXPANDED_GROUPS_KEY, JSON.stringify([...next]));
      } catch {
        /* ponytail: persistence is best-effort; session-only if storage blocked */
      }
      return next;
    });
  };

  // Group tools by category and filter — memoized. Always sorted so rows never jump on toggle.
  const groupedTools = useMemo(() => {
    const term = searchTerm.toLowerCase();
    const filtered = (effectiveTools || []).filter(
      tool =>
        tool.name.toLowerCase().includes(term) ||
        (tool.description && tool.description.toLowerCase().includes(term)),
    );

    const grouped: Record<string, ExtendedTool[]> = {};
    filtered.forEach(tool => {
      let groupName: string;
      let displayName: string;
      const dotIndex = tool.name.indexOf('.');
      if (META_TOOLS.has(tool.name)) {
        groupName = 'Discovery';
        displayName = tool.name;
      } else if (tool.name.startsWith('browser_')) {
        groupName = 'Browser';
        displayName = tool.name;
      } else if (dotIndex > 0) {
        groupName = tool.name.substring(0, dotIndex);
        displayName = tool.name.substring(dotIndex + 1);
      } else {
        groupName = 'Server';
        displayName = tool.name;
      }
      (grouped[groupName] ||= []).push({
        ...tool,
        displayName,
        originalName: tool.name,
      } as ExtendedTool);
    });

    Object.keys(grouped).forEach(g =>
      grouped[g].sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name)),
    );
    return grouped;
  }, [effectiveTools, searchTerm]);

  const handleExecute = (tool: Tool) => {
    logMessage(`[AvailableTools] Executing tool: ${tool.name}`);
    onExecute(tool);
  };

  const handleRefresh = () => {
    logMessage('[AvailableTools] Refreshing available tools');
    onRefresh();
  };

  // Toggles apply instantly (no staging / Save-Discard flow).
  const handleToggleTool = (toolName: string) => {
    if (isToolEnabled(toolName)) {
      disableTool(toolName);
      logMessage(`[AvailableTools] Tool disabled: ${toolName}`);
    } else {
      enableTool(toolName);
      logMessage(`[AvailableTools] Tool enabled: ${toolName}`);
    }
  };

  const handleEnableAll = () => {
    enableAllTools();
    logMessage('[AvailableTools] All tools enabled');
  };

  const handleDisableAll = () => {
    disableAllTools();
    logMessage('[AvailableTools] All tools disabled');
  };

  // Group-level operations
  const handleToggleGroup = (serverName: string, tools: ExtendedTool[]) => {
    const allEnabled = tools.every(tool => isToolEnabled(tool.originalName || tool.name));

    tools.forEach(tool => {
      const toolName = tool.originalName || tool.name;
      if (allEnabled) {
        disableTool(toolName);
      } else {
        enableTool(toolName);
      }
    });

    logMessage(`[AvailableTools] Group ${serverName} ${allEnabled ? 'disabled' : 'enabled'}`);
  };

  // Calculate total tools count
  const totalToolsCount = useMemo(
    () => Object.values(groupedTools).reduce((acc, tools) => acc + tools.length, 0),
    [groupedTools],
  );
  const enabledCount = useMemo(
    () =>
      Object.values(groupedTools)
        .flat()
        .filter(tool => enabledTools.has(tool.originalName || tool.name)).length,
    [groupedTools, enabledTools],
  );

  const isGroupEnabled = (tools: ExtendedTool[]) => {
    return tools.every(tool => isToolEnabled(tool.originalName || tool.name));
  };

  const isGroupPartiallyEnabled = (tools: ExtendedTool[]) => {
    const enabledCount = tools.filter(tool => isToolEnabled(tool.originalName || tool.name)).length;
    return enabledCount > 0 && enabledCount < tools.length;
  };

  return (
    <div>
      {/* Sticky toolbar: search + refresh, then count + bulk actions */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 pt-1 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon
              name="search"
              size="sm"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full h-8 pl-8 pr-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Refresh tools"
            title="Refresh tools"
            className="h-8 w-8 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors duration-150 disabled:opacity-50">
            <Icon name="refresh" size="sm" className={cn(isRefreshing ? 'animate-spin' : '')} />
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          <span>
            {enabledCount} of {totalToolsCount} enabled
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleEnableAll}
              disabled={isRefreshing || isLoadingEnablement || totalToolsCount === 0}
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:no-underline">
              Enable all
            </button>
            <button
              onClick={handleDisableAll}
              disabled={isRefreshing || isLoadingEnablement || totalToolsCount === 0}
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50 disabled:no-underline">
              Disable all
            </button>
          </div>
        </div>
      </div>

      {(isRefreshing || isLoadingEnablement) && (
        <div className="flex items-center justify-center gap-2 py-8 text-slate-500 dark:text-slate-400">
          <Icon name="refresh" className="w-5 h-5 animate-spin" />
          <span className="text-sm">{isRefreshing ? 'Refreshing tools...' : 'Loading tool preferences...'}</span>
        </div>
      )}

      {!isRefreshing && !isLoadingEnablement && totalToolsCount === 0 && (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          {searchTerm ? (
            <>
              <Icon name="search" className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm">No tools match your search</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </>
          ) : (
            <>
              <Icon name="box" className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm">{!isLoaded ? 'Loading tools...' : 'No tools available'}</p>
              <p className="text-xs mt-1">
                {isLoaded ? (
                  <>
                    Check your server connection or{' '}
                    <button onClick={handleRefresh} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                      refresh
                    </button>
                  </>
                ) : (
                  'Please wait while we connect to the server'
                )}
              </p>
            </>
          )}
        </div>
      )}

      {!isRefreshing && !isLoadingEnablement && totalToolsCount > 0 && (
        <div className="space-y-2">
          {/* Render grouped tools */}
          {Object.entries(groupedTools).sort(([a], [b]) => a.localeCompare(b)).map(([serverName, tools]) => {
            const groupEnabled = isGroupEnabled(tools);
            const groupPartiallyEnabled = isGroupPartiallyEnabled(tools);
            const groupExpanded = searchTerm.trim() !== '' || expandedGroups.has(serverName);

            return (
              <div key={serverName} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {/* Group Header */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 cursor-pointer select-none"
                  onClick={() => toggleGroupExpansion(serverName)}>
                  <Icon
                    name="chevron-right"
                    size="sm"
                    className={cn('text-slate-400 transition-transform', groupExpanded ? 'rotate-90' : '')}
                  />
                  <input
                    type="checkbox"
                    checked={groupEnabled}
                    ref={el => {
                      if (el) el.indeterminate = groupPartiallyEnabled;
                    }}
                    onChange={() => handleToggleGroup(serverName, tools)}
                    onClick={e => e.stopPropagation()}
                    className="h-4 w-4 rounded accent-indigo-600"
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{serverName}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    · {tools.filter(t => isToolEnabled(t.originalName || t.name)).length}/{tools.length}
                  </span>
                </div>

                {/* Group Tools */}
                {groupExpanded && (
                  <div className="bg-white dark:bg-slate-900">
                    {tools.map(tool => {
                      const toolName = tool.originalName || tool.name;
                      return (
                        <ToolItem
                          key={toolName}
                          tool={tool}
                          isEnabled={isToolEnabled(toolName)}
                          expanded={expandedTools.has(toolName)}
                          onToggleExpand={() => toggleToolExpansion(toolName)}
                          onToggleEnabled={() => handleToggleTool(toolName)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AvailableTools;
