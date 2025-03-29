import type React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardHeader, CardContent } from '@src/components/ui/card';
import { logMessage } from '@src/utils/helpers';

interface Tool {
  id: string;
  name: string;
  args: any;
}

interface DetectedToolsProps {
  tools: Tool[];
  onExecute: (tool: Tool) => Promise<string>;
  onInsert: (text: string) => void;
  onAttachAsFile?: (file: File) => Promise<boolean>;
  autoSubmit?: boolean;
  autoExecute?: boolean;
  triggerSubmission?: () => void;
  onClearTools?: () => void;
}

const DetectedTools: React.FC<DetectedToolsProps> = ({
  tools,
  onExecute,
  onInsert,
  onAttachAsFile,
  autoSubmit = false,
  autoExecute = false,
  triggerSubmission,
  onClearTools,
}) => {
  const [results, setResults] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [attaching, setAttaching] = useState<{ [key: string]: boolean }>({});
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [autoExecutedTools, setAutoExecutedTools] = useState<Set<string>>(new Set());

  // Queue system for tool execution
  const [toolQueue, setToolQueue] = useState<Tool[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [invalidJsonTools, setInvalidJsonTools] = useState<Set<string>>(new Set());

  // Store tool IDs that were present when auto-execute was enabled
  const existingToolsRef = useRef<Set<string>>(new Set());
  const previousAutoExecuteRef = useRef(autoExecute);

  // Deduplicate tools with the same name and arguments
  const uniqueTools = useMemo(() => {
    const toolMap = new Map<string, Tool>();

    tools.forEach(tool => {
      // Create a unique key based on tool name and stringified arguments
      const toolKey = `${tool.name}-${JSON.stringify(tool.args)}`;

      // Only add the tool if it's not already in the map
      if (!toolMap.has(toolKey)) {
        toolMap.set(toolKey, tool);
      }
    });

    // Return the array of unique tools
    return Array.from(toolMap.values());
  }, [tools]);

  // Validate JSON arguments for each tool
  useEffect(() => {
    const newInvalidTools = new Set<string>(invalidJsonTools);

    uniqueTools.forEach(tool => {
      try {
        // Check if args is valid JSON
        if (typeof tool.args === 'string') {
          try {
            JSON.parse(tool.args);
          } catch (e) {
            newInvalidTools.add(tool.id);
            if (!results[tool.id]) {
              setResults(prev => ({
                ...prev,
                [tool.id]: `Error: Invalid JSON arguments`,
              }));
            }
          }
        } else if (tool.args !== null && typeof tool.args !== 'object') {
          newInvalidTools.add(tool.id);
          if (!results[tool.id]) {
            setResults(prev => ({
              ...prev,
              [tool.id]: `Error: Arguments must be a valid JSON object or array`,
            }));
          }
        }
      } catch (error) {
        newInvalidTools.add(tool.id);
        if (!results[tool.id]) {
          setResults(prev => ({
            ...prev,
            [tool.id]: `Error validating arguments: ${error}`,
          }));
        }
      }
    });

    setInvalidJsonTools(newInvalidTools);
  }, [uniqueTools]);

  // Track when auto-execute is toggled on
  useEffect(() => {
    // When auto-execute is turned on, record all currently existing tools
    if (autoExecute && !previousAutoExecuteRef.current) {
      const currentToolIds = new Set(uniqueTools.map(tool => tool.id));
      existingToolsRef.current = currentToolIds;
      logMessage(`[DetectedTools] Auto-execute enabled. Marked ${currentToolIds.size} existing tools to be ignored.`);
    }

    previousAutoExecuteRef.current = autoExecute;
  }, [autoExecute, uniqueTools]);

  // Handle auto-execution of newly detected tools
  useEffect(() => {
    if (!autoExecute) return;

    // Find tools that:
    // 1. Haven't been auto-executed yet
    // 2. Weren't present when auto-execute was enabled
    // 3. Don't have invalid JSON arguments
    const toolsToExecute = uniqueTools.filter(
      tool =>
        !autoExecutedTools.has(tool.id) && !existingToolsRef.current.has(tool.id) && !invalidJsonTools.has(tool.id),
    );

    if (toolsToExecute.length > 0) {
      // Add tools to the auto-executed set
      const newAutoExecutedTools = new Set(autoExecutedTools);
      toolsToExecute.forEach(tool => {
        newAutoExecutedTools.add(tool.id);
        // Add tool to the execution queue
        logMessage(`[DetectedTools] Adding newly detected tool to queue: ${tool.name}`);
        addToolToQueue(tool);
      });
      setAutoExecutedTools(newAutoExecutedTools);
    }
  }, [uniqueTools, autoExecute, invalidJsonTools]);

  // Process queue effect
  useEffect(() => {
    const processQueue = async () => {
      if (toolQueue.length === 0 || isProcessingQueue) return;

      setIsProcessingQueue(true);

      const tool = toolQueue[0];
      logMessage(`[DetectedTools] Processing tool from queue: ${tool.name}`);

      try {
        // Skip execution if the tool has invalid JSON
        if (invalidJsonTools.has(tool.id)) {
          logMessage(`[DetectedTools] Skipping tool with invalid JSON arguments: ${tool.name}`);
        } else {
          setLoading(prev => ({ ...prev, [tool.id]: true }));
          const result = await onExecute(tool);
          setResults(prev => ({ ...prev, [tool.id]: result }));

          // Auto-insert and submit if autoSubmit is enabled
          if (autoSubmit && triggerSubmission) {
            setTimeout(() => {
              const formattedResult = `<tool_output>\n${result}\n</tool_output>`;
              onInsert(formattedResult);
              // Add a small delay to ensure text is inserted before submission
              setTimeout(() => {
                triggerSubmission();
              }, 300);
            }, 300);
          }
        }
      } catch (error) {
        console.error('Error executing tool:', error);
        setResults(prev => ({ ...prev, [tool.id]: `Error: ${error}` }));
      } finally {
        setLoading(prev => ({ ...prev, [tool.id]: false }));

        // Remove the processed tool from the queue
        setToolQueue(prev => prev.slice(1));

        // Wait for 1 second before processing the next tool
        setTimeout(() => {
          setIsProcessingQueue(false);
        }, 1000);
      }
    };

    processQueue();
  }, [toolQueue, isProcessingQueue, onExecute, autoSubmit, triggerSubmission, invalidJsonTools]);

  const toggleExpand = (toolId: string) => {
    setExpandedTool(expandedTool === toolId ? null : toolId);
  };

  // Function to add a tool to the execution queue
  const addToolToQueue = (tool: Tool) => {
    // Don't add tools with invalid JSON to the queue
    if (invalidJsonTools.has(tool.id)) {
      logMessage(`[DetectedTools] Cannot queue tool with invalid JSON arguments: ${tool.name}`);
      return;
    }

    setToolQueue(prev => [...prev, tool]);
    logMessage(`[DetectedTools] Added tool to queue: ${tool.name}`);
  };

  const handleExecute = async (tool: Tool, e?: React.MouseEvent) => {
    e?.stopPropagation();
    // Instead of executing immediately, add to queue
    addToolToQueue(tool);
  };

  const handleInsert = (result: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const formattedResult = `<tool_output>\n${result}\n</tool_output>`;
    onInsert(formattedResult);

    // If autoSubmit is enabled, trigger submission after insertion
    if (autoSubmit && triggerSubmission) {
      // Add a small delay to ensure text is inserted before submission
      setTimeout(() => {
        triggerSubmission();
      }, 300);
    }
  };

  const handleAttachAsFile = async (tool: Tool, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onAttachAsFile) return;

    try {
      setAttaching(prev => ({ ...prev, [tool.id]: true }));

      // Generate filename with tool ID and current date/time
      const now = new Date();
      const dateTimeStr = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const fileName = `${tool.name}_${dateTimeStr}.txt`;

      // Create file object
      const fileContent = results[tool.id];
      const file = new File([fileContent], fileName, { type: 'text/plain' });

      // Attach file using the provided function
      await onAttachAsFile(file);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for file attachment
      await onInsert(`<tool_output>\nOutput of tool ${tool.name} is attached as a file: ${fileName}\n</tool_output>`);
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for the insert
      // If autoSubmit is enabled, trigger submission after attachment
      if (autoSubmit && triggerSubmission) {
        setTimeout(() => {
          triggerSubmission();
        }, 300); // Longer delay for file attachment
      }
    } catch (error) {
      console.error('Error attaching result as file:', error);
    } finally {
      setAttaching(prev => ({ ...prev, [tool.id]: false }));
    }
  };

  const clearAllTools = () => {
    logMessage(`[DetectedTools] Clearing all tools and queue`);
    setToolQueue([]);
    setResults({});
    setLoading({});
    setAttaching({});
    setExpandedTool(null);
    setIsProcessingQueue(false);
    // We don't reset autoExecutedTools to prevent re-execution

    // Call parent callback to clear the actual tools array if provided
    if (onClearTools) {
      onClearTools();
    }
  };

  if (uniqueTools.length === 0) {
    return null; // Don't render anything if no tools are detected
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="p-3 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <Typography variant="h4" className="flex items-center">
            <Icon name="lightning" size="sm" className="mr-1.5 text-emerald-500" />
            Detected Tools
            <span className="ml-1.5 px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-600 rounded dark:bg-emerald-900/30 dark:text-emerald-400">
              {uniqueTools.length}
            </span>
            {toolQueue.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-600 rounded dark:bg-blue-900/30 dark:text-blue-400">
                Queue: {toolQueue.length}
              </span>
            )}
          </Typography>

          {/* Add Clear All button */}
          {(uniqueTools.length > 0 || toolQueue.length > 0) && (
            <Button
              onClick={clearAllTools}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs bg-red-100/50 hover:bg-red-200/50 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400">
              <span className="flex items-center">
                <Icon name="x" size="sm" className="mr-0.5" />
                <span>Clear All</span>
              </span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-2 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent dark:scrollbar-thumb-slate-600">
        <ul className="space-y-2">
          {uniqueTools.map(tool => (
            <li
              key={tool.id}
              className="rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div className="px-3 py-2.5 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleExpand(tool.id)}>
                    <Icon name="lightning" size="sm" className="text-emerald-500" />
                    <Typography variant="body" className="font-medium">
                      {tool.name}
                    </Typography>
                    {invalidJsonTools.has(tool.id) && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded dark:bg-red-900/30 dark:text-red-400">
                        Invalid Args
                      </span>
                    )}
                    {toolQueue.some(queuedTool => queuedTool.id === tool.id) && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-600 rounded dark:bg-blue-900/30 dark:text-blue-400">
                        Queued
                      </span>
                    )}
                    <Icon
                      name="chevron-down"
                      size="sm"
                      className={cn(
                        'text-slate-400 transition-transform',
                        expandedTool === tool.id ? 'rotate-180' : '',
                      )}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Primary Execute Button - Always visible */}
                    <Button
                      onClick={e => handleExecute(tool, e)}
                      disabled={
                        loading[tool.id] ||
                        toolQueue.some(queuedTool => queuedTool.id === tool.id) ||
                        invalidJsonTools.has(tool.id)
                      }
                      size="sm"
                      variant="outline"
                      className={cn(
                        'h-7 px-2 text-xs',
                        loading[tool.id] ||
                          toolQueue.some(queuedTool => queuedTool.id === tool.id) ||
                          invalidJsonTools.has(tool.id)
                          ? 'opacity-50'
                          : 'bg-emerald-100/50 hover:bg-emerald-200/50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
                      )}>
                      {loading[tool.id] ? (
                        <span className="flex items-center">
                          <Icon name="refresh" size="sm" className="animate-spin" />
                        </span>
                      ) : invalidJsonTools.has(tool.id) ? (
                        <span className="flex items-center">
                          <Icon name="x" size="sm" className="mr-0.5" />
                          <span>Invalid</span>
                        </span>
                      ) : toolQueue.some(queuedTool => queuedTool.id === tool.id) ? (
                        <span className="flex items-center">
                          <Icon name="refresh" size="sm" className="mr-0.5" />
                          <span>Queued</span>
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <Icon name="play" size="sm" className="mr-0.5" />
                          <span>{autoSubmit ? 'Run' : 'Run'}</span>
                        </span>
                      )}
                    </Button>

                    {/* Show Insert and Attach buttons only when result is available */}
                    {results[tool.id] && (
                      <>
                        <Button
                          onClick={e => handleInsert(results[tool.id], e)}
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs bg-purple-100/50 hover:bg-purple-200/50 dark:bg-purple-900/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                          <span className="flex items-center">
                            <Icon name="check" size="sm" className="mr-0.5" />
                            <span>Insert</span>
                          </span>
                        </Button>

                        {onAttachAsFile && (
                          <Button
                            onClick={e => handleAttachAsFile(tool, e)}
                            disabled={attaching[tool.id]}
                            size="sm"
                            variant="outline"
                            className={cn(
                              'h-7 px-2 text-xs',
                              attaching[tool.id]
                                ? 'opacity-50'
                                : 'bg-slate-100/50 hover:bg-slate-200/50 dark:bg-slate-900/20 dark:hover:bg-slate-900/30 text-slate-700 dark:text-slate-400',
                            )}>
                            {attaching[tool.id] ? (
                              <span className="flex items-center">
                                <Icon name="refresh" size="sm" className="animate-spin" />
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <Icon name="tools" size="sm" className="mr-0.5" />
                                <span>Attach</span>
                              </span>
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {expandedTool === tool.id && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <div className="mb-3">
                    <Typography variant="caption" className="mb-1 block">
                      Arguments:
                    </Typography>
                    <pre
                      className={cn(
                        'text-xs bg-white p-2 rounded overflow-x-auto text-slate-700 dark:bg-slate-900 dark:text-slate-300',
                        invalidJsonTools.has(tool.id) ? 'border border-red-300 dark:border-red-700' : '',
                      )}>
                      {JSON.stringify(tool.args, null, 2)}
                    </pre>
                  </div>

                  {results[tool.id] && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1">
                        <Typography variant="caption" className="block">
                          Result:
                        </Typography>
                      </div>
                      <div
                        className={cn(
                          'text-xs bg-white p-2 rounded overflow-x-auto text-slate-700 dark:bg-slate-900 dark:text-slate-300',
                          results[tool.id].startsWith('Error:')
                            ? 'border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
                            : '',
                        )}>
                        {results[tool.id]}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

export default DetectedTools;
