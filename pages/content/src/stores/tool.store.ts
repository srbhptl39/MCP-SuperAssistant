import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { eventBus } from '../events';
import type { Tool, DetectedTool, ToolExecution } from '../types/stores';

export interface ToolState {
  availableTools: Tool[];
  detectedTools: DetectedTool[];
  toolExecutions: Record<string, ToolExecution>; // Store executions by ID
  isExecuting: boolean;
  lastExecutionId: string | null;

  // Actions
  setAvailableTools: (tools: Tool[]) => void;
  addDetectedTool: (tool: DetectedTool) => void;
  clearDetectedTools: () => void;
  startToolExecution: (toolName: string, parameters: Record<string, any>) => string; // Returns execution ID
  updateToolExecution: (execution: Partial<ToolExecution> & { id: string }) => void;
  completeToolExecution: (id: string, result: any, status: 'success' | 'error', error?: string) => void;
  getToolExecution: (id: string) => ToolExecution | undefined;
}

const initialState: Omit<ToolState, 'setAvailableTools' | 'addDetectedTool' | 'clearDetectedTools' | 'startToolExecution' | 'updateToolExecution' | 'completeToolExecution' | 'getToolExecution'> = {
  availableTools: [],
  detectedTools: [],
  toolExecutions: {},
  isExecuting: false,
  lastExecutionId: null,
};

export const useToolStore = create<ToolState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setAvailableTools: (tools: Tool[]) => {
        set({ availableTools: tools });
        console.log('[ToolStore] Available tools updated:', tools);
        eventBus.emit('tool:list-updated', { tools });
      },

      addDetectedTool: (tool: DetectedTool) => {
        set(state => ({ detectedTools: [...state.detectedTools, tool] }));
        console.log('[ToolStore] Tool detected:', tool);
        eventBus.emit('tool:detected', { tools: [tool], source: tool.source || 'unknown' });
      },

      clearDetectedTools: () => {
        set({ detectedTools: [] });
        console.log('[ToolStore] Detected tools cleared.');
      },

      startToolExecution: (toolName: string, parameters: Record<string, any>): string => {
        const executionId = `exec_${toolName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newExecution: ToolExecution = {
          id: executionId,
          toolName,
          parameters,
          status: 'pending',
          timestamp: Date.now(),
          result: null,
        };
        set(state => ({
          toolExecutions: { ...state.toolExecutions, [executionId]: newExecution },
          isExecuting: true,
          lastExecutionId: executionId,
        }));
        console.log(`[ToolStore] Starting execution for ${toolName} (ID: ${executionId})`, parameters);
        eventBus.emit('tool:execution-started', { toolName, callId: executionId });
        return executionId;
      },

      updateToolExecution: (executionUpdate: Partial<ToolExecution> & { id: string }) => {
        const { id, ...updateData } = executionUpdate;
        const existingExecution = get().toolExecutions[id];
        if (existingExecution) {
          const updatedExecution = { ...existingExecution, ...updateData, timestamp: Date.now() };
          set(state => ({
            toolExecutions: { ...state.toolExecutions, [id]: updatedExecution },
            isExecuting: updatedExecution.status === 'pending',
          }));
          console.log(`[ToolStore] Execution updated (ID: ${id}):`, updatedExecution);
          if (updatedExecution.status === 'success' || updatedExecution.status === 'error') {
             eventBus.emit('tool:execution-completed', { execution: updatedExecution });
          }
        } else {
          console.warn(`[ToolStore] Attempted to update non-existent execution (ID: ${id})`);
        }
      },
      
      completeToolExecution: (id: string, result: any, status: 'success' | 'error', error?: string) => {
        const execution = get().toolExecutions[id];
        if (execution) {
          const completedExecution: ToolExecution = {
            ...execution,
            result,
            status,
            error,
            timestamp: Date.now(),
          };
          set(state => ({
            toolExecutions: { ...state.toolExecutions, [id]: completedExecution },
            isExecuting: Object.values(state.toolExecutions).some(ex => ex.id !== id && ex.status === 'pending'),
          }));
          console.log(`[ToolStore] Execution ${status} (ID: ${id}):`, completedExecution);
          eventBus.emit('tool:execution-completed', { execution: completedExecution });
          if (status === 'error') {
            eventBus.emit('tool:execution-failed', { toolName: execution.toolName, error: error || 'Unknown execution error', callId: id });
          }
        } else {
          console.warn(`[ToolStore] Attempted to complete non-existent execution (ID: ${id})`);
        }
      },

      getToolExecution: (id: string): ToolExecution | undefined => {
        return get().toolExecutions[id];
      },
    }),
    { name: 'ToolStore', store: 'tool' }
  )
);
