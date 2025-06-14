import type React from 'react';
import { useState, useEffect } from 'react';
import type { Tool } from '@src/types/mcp';
import { useAvailableTools, useToolExecution } from '../../../hooks';
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

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use tools from store if available, fallback to props
  const effectiveTools = storeTools.length > 0 ? storeTools : tools;

  // Mark component as loaded after initial render
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setIsLoaded(true);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, []);

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

  // Filter tools using effective tools (store or props)
  const filteredTools = (effectiveTools || []).filter(
    tool =>
      tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tool.description && tool.description.toLowerCase().includes(searchTerm.toLowerCase())),
  );

  const handleExecute = (tool: Tool) => {
    logMessage(`[AvailableTools] Executing tool: ${tool.name}`);
    onExecute(tool);
  };

  const handleRefresh = () => {
    logMessage('[AvailableTools] Refreshing available tools');
    onRefresh();
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <CardHeader className="p-4 pb-2 flex-row items-center justify-between bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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

          {isRefreshing && (
            <div className="flex items-center justify-center py-8 text-slate-500 dark:text-slate-400">
              <Icon name="refresh" className="w-8 h-8 animate-spin mr-3" />
              <Typography variant="body" className="text-lg">
                Refreshing tools...
              </Typography>
            </div>
          )}

          {!isRefreshing && filteredTools.length === 0 && (
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

          {!isRefreshing && filteredTools.length > 0 && (
            <div className="space-y-3">
              {filteredTools.map(tool => (
                <div
                  key={tool.name}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
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
                      <Typography variant="body" className="font-medium">
                        {tool.name}
                      </Typography>
                    </div>
                    {/* <Button
                      onClick={e => {
                        e.stopPropagation();
                        handleExecute(tool);
                      }}
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 p-0 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"
                      aria-label="Execute tool">
                      <Icon name="play" size="sm" />
                    </Button> */}
                  </div>

                  {expandedTools.has(tool.name) && (
                    <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                      {tool.description && (
                        <Typography variant="body" className="text-slate-600 dark:text-slate-300 mb-2">
                          {tool.description}
                        </Typography>
                      )}
                      <div className="mt-2">
                        <Typography variant="caption" className="mb-1 text-slate-500 dark:text-slate-400">
                          Schema
                        </Typography>
                        <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
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
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default AvailableTools;
