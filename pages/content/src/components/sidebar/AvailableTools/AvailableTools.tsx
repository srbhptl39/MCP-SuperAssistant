import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import type { Tool } from '@src/types/mcp';
import { useAvailableTools, useToolExecution, useToolEnablement } from '../../../hooks';
import { logMessage } from '@src/utils/helpers';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardHeader, CardContent } from '@src/components/ui/card';


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

  // Filter and sort tools - memoized to prevent unnecessary recalculations
  const filteredTools = useMemo(() => {
    const filtered = (effectiveTools || []).filter(
      tool =>
        tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tool.description && tool.description.toLowerCase().includes(searchTerm.toLowerCase())),
    );
    
    // Sort enabled tools first only after save (no pending changes)
    if (!hasUnsavedChanges) {
      return filtered.sort((a, b) => {
        const aEnabled = isToolEnabled(a.name);
        const bEnabled = isToolEnabled(b.name);
        
        if (aEnabled && !bEnabled) return -1;
        if (!aEnabled && bEnabled) return 1;
        
        // Maintain alphabetical order within enabled/disabled groups
        return a.name.localeCompare(b.name);
      });
    }
    
    // When there are unsaved changes, maintain current order to prevent jumping
    return filtered;
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
                {enabledTools.size} of {effectiveTools.length} tools enabled
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleEnableAll}
                size="sm"
                variant="outline"
                disabled={isRefreshing || isLoadingEnablement || effectiveTools.length === 0}
                className="h-8 px-3 text-xs bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
                Enable All
              </Button>
              <Button
                onClick={handleDisableAll}
                size="sm"
                variant="outline"
                disabled={isRefreshing || isLoadingEnablement || effectiveTools.length === 0}
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

          {!isRefreshing && !isLoadingEnablement && filteredTools.length === 0 && (
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

          {!isRefreshing && !isLoadingEnablement && filteredTools.length > 0 && (
            <div className="space-y-3">
              {filteredTools.map(tool => {
                const isEnabled = isToolEnabled(tool.name);
                return (
                  <div
                    key={tool.name}
                    className={cn(
                      "border rounded-lg overflow-hidden transition-all",
                      isEnabled 
                        ? "border-slate-200 dark:border-slate-700" 
                        : "border-slate-300 dark:border-slate-600 opacity-60"
                    )}>
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 cursor-pointer transition-colors",
                        isEnabled 
                          ? "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                          : "bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-150 dark:hover:bg-slate-700/50"
                      )}
                      onClick={() => toggleToolExpansion(tool.name)}>
                      <div className="flex items-center">
                        <Icon
                          name="chevron-right"
                          size="sm"
                          className={cn(
                            'mr-2 text-slate-500 dark:text-slate-400 transition-transform',
                            expandedTools.has(tool.name) ? 'rotate-90' : '',
                          )}
                        />
                        <div className="flex items-center mr-3">
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
                            className="w-4 h-4 mr-2 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                          />
                        </div>
                        <Typography 
                          variant="body" 
                          className={cn(
                            "font-medium transition-colors",
                            isEnabled 
                              ? "text-slate-900 dark:text-slate-100"
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

                    {expandedTools.has(tool.name) && (
                      <div className={cn(
                        "p-3 border-t border-slate-200 dark:border-slate-700",
                        isEnabled 
                          ? "bg-white dark:bg-slate-900"
                          : "bg-slate-50 dark:bg-slate-800/50"
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
                              ? "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                              : "bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600"
                          )}>
                            {(() => {
                              try {
                                // Handle both schema formats (mcp.Tool and stores.Tool)
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
        </CardContent>
      )}
    </Card>
  );
};

export default AvailableTools;
