import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import type { Tool } from '@src/types/mcp';
import { useAvailableTools, useToolExecution, useToolEnablement } from '../../../hooks';
import { logMessage } from '@src/utils/helpers';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardHeader, CardContent } from '@src/components/ui/card';

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

const AvailableTools: React.FC<AvailableToolsProps> = ({ tools, onExecute, onRefresh, isRefreshing }) => {
  // Use Zustand hooks for tool management
  const { tools: storeTools } = useAvailableTools();
  const { executions, isExecuting } = useToolExecution();
  const { enabledTools, enableTool, disableTool, enableAllTools, disableAllTools, isToolEnabled, loadToolEnablementState, isLoadingEnablement } = useToolEnablement();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Set<string>>(new Set());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  const toggleComponentExpansion = () => {
    setIsExpanded(!isExpanded);
    logMessage(`[AvailableTools] Component ${!isExpanded ? 'expanded' : 'collapsed'}`);
  };

  // Group tools by server name and filter - memoized to prevent unnecessary recalculations
  const { groupedTools, ungroupedTools } = useMemo(() => {
    const filtered = (effectiveTools || []).filter(
      tool =>
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tool.description && tool.description.toLowerCase().includes(searchTerm.toLowerCase())),
    );

    const grouped: Record<string, ExtendedTool[]> = {};
    const ungrouped: ExtendedTool[] = [];

    filtered.forEach(tool => {
      const dotIndex = tool.name.indexOf('.');
      if (dotIndex > 0) {
        const serverName = tool.name.substring(0, dotIndex);
        const toolName = tool.name.substring(dotIndex + 1);
        
        if (!grouped[serverName]) {
          grouped[serverName] = [];
        }
        grouped[serverName].push({
          ...tool,
          displayName: toolName, // Store the short name for display
          originalName: tool.name // Keep original for functionality
        } as ExtendedTool);
      } else {
        ungrouped.push(tool as ExtendedTool);
      }
    });

    // Sort tools within each group
    Object.keys(grouped).forEach(serverName => {
      grouped[serverName].sort((a, b) => {
        if (!hasUnsavedChanges) {
          const aEnabled = isToolEnabled(a.originalName || a.name);
          const bEnabled = isToolEnabled(b.originalName || b.name);
          
          if (aEnabled && !bEnabled) return -1;
          if (!aEnabled && bEnabled) return 1;
        }
        
        const aName = a.displayName || a.name;
        const bName = b.displayName || b.name;
        return aName.localeCompare(bName);
      });
    });

    // Sort ungrouped tools
    ungrouped.sort((a, b) => {
      if (!hasUnsavedChanges) {
        const aEnabled = isToolEnabled(a.name);
        const bEnabled = isToolEnabled(b.name);
        
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
      }
      
      return a.name.localeCompare(b.name);
    });

    return { groupedTools: grouped, ungroupedTools: ungrouped };
  }, [effectiveTools, searchTerm, enabledTools, hasUnsavedChanges]);

  const handleExecute = (tool: Tool) => {
    logMessage(`[AvailableTools] Executing tool: ${tool.name}`);
    onExecute(tool);
  };

  const handleRefresh = () => {
    logMessage('[AvailableTools] Refreshing available tools');
    onRefresh();
  };

  const handleToggleTool = (toolName: string) => {
    setHasUnsavedChanges(true);
    setPendingChanges(prev => {
      const newPending = new Set(prev);
      if (newPending.has(toolName)) {
        newPending.delete(toolName);
      } else {
        newPending.add(toolName);
      }
      return newPending;
    });
    
    if (isToolEnabled(toolName)) {
      disableTool(toolName);
      logMessage(`[AvailableTools] Tool disabled: ${toolName}`);
    } else {
      enableTool(toolName);
      logMessage(`[AvailableTools] Tool enabled: ${toolName}`);
    }
  };

  const handleSaveChanges = () => {
    setHasUnsavedChanges(false);
    setPendingChanges(new Set());
    logMessage('[AvailableTools] Tool changes saved and sorted');
  };

  const handleDiscardChanges = () => {
    // Revert all pending changes
    pendingChanges.forEach(toolName => {
      if (isToolEnabled(toolName)) {
        disableTool(toolName);
      } else {
        enableTool(toolName);
      }
    });
    
    setHasUnsavedChanges(false);
    setPendingChanges(new Set());
    logMessage('[AvailableTools] Tool changes discarded');
  };

  const handleEnableAll = () => {
    setHasUnsavedChanges(true);
    enableAllTools();
    logMessage('[AvailableTools] All tools enabled');
  };

  const handleDisableAll = () => {
    setHasUnsavedChanges(true);
    disableAllTools();
    logMessage('[AvailableTools] All tools disabled');
  };

  // Group-level operations
  const handleToggleGroup = (serverName: string, tools: ExtendedTool[]) => {
    setHasUnsavedChanges(true);
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
  const totalToolsCount = useMemo(() => {
    const groupedCount = Object.values(groupedTools).reduce((acc, tools) => acc + tools.length, 0);
    return groupedCount + ungroupedTools.length;
  }, [groupedTools, ungroupedTools]);

  const isGroupEnabled = (tools: ExtendedTool[]) => {
    return tools.every(tool => isToolEnabled(tool.originalName || tool.name));
  };

  const isGroupPartiallyEnabled = (tools: ExtendedTool[]) => {
    const enabledCount = tools.filter(tool => isToolEnabled(tool.originalName || tool.name)).length;
    return enabledCount > 0 && enabledCount < tools.length;
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <CardHeader className="p-4 pb-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={toggleComponentExpansion}
              className="p-1 mr-2 rounded transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              aria-label={isExpanded ? 'Collapse tools' : 'Expand tools'}>
              <Icon
                name="chevron-right"
                size="sm"
                className={cn('text-slate-600 dark:text-slate-300 transition-transform', isExpanded ? 'rotate-90' : '')}
              />
            </button>
            <Typography variant="h3">Available Tools</Typography>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            size="sm"
            variant="outline"
            className={cn(
              'h-9 w-9 p-0',
              isRefreshing ? 'opacity-50' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600',
            )}
            aria-label="Refresh tools">
            <Icon
              name="refresh"
              size="sm"
              className={cn('text-slate-700 dark:text-slate-300', isRefreshing ? 'animate-spin' : '')}
            />
          </Button>
        </div>
        
        {isExpanded && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Typography variant="small" className="text-slate-600 dark:text-slate-400">
                {enabledTools.size} of {totalToolsCount} tools enabled
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleEnableAll}
                size="sm"
                variant="outline"
                disabled={isRefreshing || isLoadingEnablement || totalToolsCount === 0}
                className="h-8 px-3 text-xs bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                Enable All
              </Button>
              <Button
                onClick={handleDisableAll}
                size="sm"
                variant="outline"
                disabled={isRefreshing || isLoadingEnablement || totalToolsCount === 0}
                className="h-8 px-3 text-xs bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
                Disable All
              </Button>
              {hasUnsavedChanges && (
                <>
                  <Button
                    onClick={handleSaveChanges}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                    Save Changes
                  </Button>
                  <Button
                    onClick={handleDiscardChanges}
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800">
                    Discard
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-4 pt-4 bg-white dark:bg-slate-900">
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search tools..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full px-3 py-2 pl-10 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <div className="absolute left-3 top-2.5">
                <Icon name="search" size="sm" className="text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          </div>

          {(isRefreshing || isLoadingEnablement) && (
            <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
              <Icon name="refresh" className="w-8 h-8 animate-spin mr-3" />
              <Typography variant="body" className="text-lg">
                {isRefreshing ? 'Refreshing tools...' : 'Loading tool preferences...'}
              </Typography>
            </div>
          )}

          {!isRefreshing && !isLoadingEnablement && totalToolsCount === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              {searchTerm ? (
                <>
                  <Icon name="search" className="w-12 h-12 mx-auto mb-3" />
                  <Typography variant="body" className="text-lg">
                    No tools match your search
                  </Typography>
                  <Typography variant="small" className="mt-1">
                    Try a different search term
                  </Typography>
                </>
              ) : (
                <>
                  <svg
                    className="w-12 h-12 mx-auto mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <Typography variant="body" className="text-lg">
                    {!isLoaded ? 'Loading tools...' : 'No tools available'}
                  </Typography>
                  <Typography variant="small" className="mt-1">
                    {isLoaded ? (
                      <>
                        Check your server connection or{' '}
                        <button
                          onClick={handleRefresh}
                          className="text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100">
                          refresh
                        </button>
                      </>
                    ) : (
                      'Please wait while we connect to the server'
                    )}
                  </Typography>
                </>
              )}
            </div>
          )}

          {!isRefreshing && !isLoadingEnablement && totalToolsCount > 0 && (
            <div className="space-y-4">
              {/* Render grouped tools */}
              {Object.entries(groupedTools).map(([serverName, tools]) => {
                const groupEnabled = isGroupEnabled(tools);
                const groupPartiallyEnabled = isGroupPartiallyEnabled(tools);
                const groupExpanded = expandedTools.has(serverName);
                
                return (
                  <div key={serverName} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {/* Group Header */}
                    <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleToolExpansion(serverName)}
                            className="p-1 mr-2 rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
                            aria-label={groupExpanded ? 'Collapse group' : 'Expand group'}>
                            <Icon
                              name="chevron-right"
                              size="sm"
                              className={cn(
                                'text-slate-600 dark:text-slate-400 transition-transform',
                                groupExpanded ? 'rotate-90' : ''
                              )}
                            />
                          </button>
                          <input
                            type="checkbox"
                            checked={groupEnabled}
                            ref={(el) => {
                              if (el) el.indeterminate = groupPartiallyEnabled;
                            }}
                            onChange={() => handleToggleGroup(serverName, tools)}
                            className="w-4 h-4 mr-3 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                          />
                          <Typography variant="h4" className="text-slate-800 dark:text-slate-200 font-semibold">
                            {serverName}
                          </Typography>
                          <Typography variant="small" className="ml-2 text-slate-500 dark:text-slate-400">
                            ({tools.length} tools)
                          </Typography>
                        </div>
                        <div className="flex items-center gap-2">
                          {groupPartiallyEnabled && (
                            <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                              Partial
                            </span>
                          )}
                          {!groupEnabled && !groupPartiallyEnabled && (
                            <span className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                              Disabled
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Group Tools */}
                    {groupExpanded && (
                      <div className="bg-white dark:bg-slate-900">
                        {tools.map(tool => {
                          const toolName = tool.originalName || tool.name;
                          const displayName = tool.displayName || tool.name;
                          const isEnabled = isToolEnabled(toolName);
                          const toolExpanded = expandedTools.has(toolName);
                          
                          return (
                            <div key={toolName} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                              <div
                                className={cn(
                                  "flex items-center justify-between p-3 cursor-pointer transition-colors",
                                  isEnabled 
                                    ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    : "hover:bg-slate-50 dark:hover:bg-slate-800/30 opacity-60"
                                )}
                                onClick={() => toggleToolExpansion(toolName)}>
                                <div className="flex items-center">
                                  <Icon
                                    name="chevron-right"
                                    size="sm"
                                    className={cn(
                                      'mr-2 text-slate-400 dark:text-slate-500 transition-transform',
                                      toolExpanded ? 'rotate-90' : '',
                                    )}
                                  />
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleToggleTool(toolName);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className="w-4 h-4 mr-3 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                                  />
                                  <Typography 
                                    variant="body" 
                                    className={cn(
                                      "font-medium transition-colors",
                                      isEnabled 
                                        ? "text-slate-800 dark:text-slate-200"
                                        : "text-slate-500 dark:text-slate-400"
                                    )}>
                                    {displayName}
                                  </Typography>
                                  {!isEnabled && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                              </div>

                              {toolExpanded && (
                                <div className={cn(
                                  "p-3 bg-slate-50 dark:bg-slate-800/50",
                                  !isEnabled && "opacity-60"
                                )}>
                                  {tool.description && (
                                    <Typography 
                                      variant="body" 
                                      className={cn(
                                        "mb-2",
                                        isEnabled 
                                          ? "text-slate-600 dark:text-slate-300"
                                          : "text-slate-500 dark:text-slate-400"
                                      )}>
                                      {tool.description}
                                    </Typography>
                                  )}
                                  <div className="mt-2">
                                    <Typography 
                                      variant="caption" 
                                      className={cn(
                                        "mb-1",
                                        isEnabled 
                                          ? "text-slate-500 dark:text-slate-400"
                                          : "text-slate-400 dark:text-slate-500"
                                      )}>
                                      Schema
                                    </Typography>
                                    <pre className={cn(
                                      "text-xs p-2 whitespace-pre-wrap max-h-60 overflow-y-auto rounded border",
                                      isEnabled 
                                        ? "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                        : "bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600"
                                    )}>
                                      {(() => {
                                        try {
                                          const schema = (tool as any).schema || (tool as any).input_schema;
                                          if (!schema) return 'No schema available';

                                          const schemaObject = typeof schema === 'string' ? JSON.parse(schema) : schema;
                                          return JSON.stringify(schemaObject, null, 2);
                                        } catch (error) {
                                          console.error('Error processing tool schema:', error);
                                          const schema = (tool as any).schema || (tool as any).input_schema;
                                          return typeof schema === 'string' ? schema : 'Invalid schema format';
                                        }
                                      })()}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Render ungrouped tools */}
              {ungroupedTools.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-3">
                    <Typography variant="h4" className="text-slate-800 dark:text-slate-200 font-semibold">
                      Individual Tools
                    </Typography>
                    <Typography variant="small" className="text-slate-500 dark:text-slate-400">
                      ({ungroupedTools.length} tools)
                    </Typography>
                  </div>
                  <div className="bg-white dark:bg-slate-900">
                    {ungroupedTools.map(tool => {
                      const isEnabled = isToolEnabled(tool.name);
                      const toolExpanded = expandedTools.has(tool.name);
                      
                      return (
                        <div key={tool.name} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0">
                          <div
                            className={cn(
                              "flex items-center justify-between p-3 cursor-pointer transition-colors",
                              isEnabled 
                                ? "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/30 opacity-60"
                            )}
                            onClick={() => toggleToolExpansion(tool.name)}>
                            <div className="flex items-center">
                              <Icon
                                name="chevron-right"
                                size="sm"
                                className={cn(
                                  'mr-2 text-slate-400 dark:text-slate-500 transition-transform',
                                  toolExpanded ? 'rotate-90' : '',
                                )}
                              />
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggleTool(tool.name);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="w-4 h-4 mr-3 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                              />
                              <Typography 
                                variant="body" 
                                className={cn(
                                  "font-medium transition-colors",
                                  isEnabled 
                                    ? "text-slate-800 dark:text-slate-200"
                                    : "text-slate-500 dark:text-slate-400"
                                )}>
                                {tool.name}
                              </Typography>
                              {!isEnabled && (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                                  Disabled
                                </span>
                              )}
                            </div>
                          </div>

                          {toolExpanded && (
                            <div className={cn(
                              "p-3 bg-slate-50 dark:bg-slate-800/50",
                              !isEnabled && "opacity-60"
                            )}>
                              {tool.description && (
                                <Typography 
                                  variant="body" 
                                  className={cn(
                                    "mb-2",
                                    isEnabled 
                                      ? "text-slate-600 dark:text-slate-300"
                                      : "text-slate-500 dark:text-slate-400"
                                  )}>
                                  {tool.description}
                                </Typography>
                              )}
                              <div className="mt-2">
                                <Typography 
                                  variant="caption" 
                                  className={cn(
                                    "mb-1",
                                    isEnabled 
                                      ? "text-slate-500 dark:text-slate-400"
                                      : "text-slate-400 dark:text-slate-500"
                                  )}>
                                  Schema
                                </Typography>
                                <pre className={cn(
                                  "text-xs p-2 whitespace-pre-wrap max-h-60 overflow-y-auto rounded border",
                                  isEnabled 
                                    ? "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                                    : "bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600"
                                )}>
                                  {(() => {
                                    try {
                                      const schema = (tool as any).schema || (tool as any).input_schema;
                                      if (!schema) return 'No schema available';

                                      const schemaObject = typeof schema === 'string' ? JSON.parse(schema) : schema;
                                      return JSON.stringify(schemaObject, null, 2);
                                    } catch (error) {
                                      console.error('Error processing tool schema:', error);
                                      const schema = (tool as any).schema || (tool as any).input_schema;
                                      return typeof schema === 'string' ? schema : 'Invalid schema format';
                                    }
                                  })()}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default AvailableTools;
