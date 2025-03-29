import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateInstructions } from './instructionGenerator';
import { Typography, Icon } from '../ui';
import { cn } from '@src/lib/utils';
import { logMessage } from '@src/utils/helpers';

interface InstructionManagerProps {
  adapter: any;
  tools: Array<{ name: string; schema: string; description: string }>;
}

const InstructionManager: React.FC<InstructionManagerProps> = ({ adapter, tools }) => {
  const [instructions, setInstructions] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isInserting, setIsInserting] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Memoize tools to prevent unnecessary regeneration
  const toolsSignature = useMemo(() => {
    return tools.map(tool => tool.name).join(',');
  }, [tools]);

  // Update instructions when tools change, using memoized value
  useEffect(() => {
    if (tools.length > 0) {
      logMessage('Generating instructions based on updated tools');
      // Use a local variable to avoid closure issues
      const newInstructions = generateInstructions(tools);
      setInstructions(newInstructions);
    }

    // Cleanup function to prevent memory leaks
    return () => {
      logMessage('Cleaning up instruction generator effect');
    };
  }, [toolsSignature]); // Depend on the signature instead of the entire tools array

  // Memoize handlers to prevent recreation on each render
  const handleInsertInChat = useCallback(async () => {
    if (!instructions) return;

    setIsInserting(true);
    try {
      logMessage('Inserting instructions into chat');
      adapter.insertTextIntoInput(instructions);
      // adapter.triggerSubmission();
    } catch (error) {
      console.error('Error inserting instructions:', error);
    } finally {
      setIsInserting(false);
    }
  }, [adapter, instructions]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!instructions) return;

    setIsCopying(true);
    try {
      logMessage('Copying instructions to clipboard');
      await navigator.clipboard.writeText(instructions);
    } catch (error) {
      console.error('Error copying instructions to clipboard:', error);
    } finally {
      setIsCopying(false);
    }
  }, [instructions]);

  const handleAttachAsFile = useCallback(async () => {
    if (!instructions || !adapter.supportsFileUpload()) return;

    setIsAttaching(true);
    try {
      // Determine file type based on adapter
      const isPerplexity = adapter.name === 'Perplexity';
      const isGemini = adapter.name === 'Gemini';
      // Use text/plain for both Perplexity and Gemini
      const fileType = isPerplexity || isGemini ? 'text/plain' : 'text/markdown';
      const fileExtension = isPerplexity || isGemini ? '.txt' : '.md';
      const fileName = `instructions${fileExtension}`;

      logMessage(`Attaching instructions as ${fileName}`);
      // Create the file object
      const file = new File([instructions], fileName, { type: fileType });

      // Attach the file using the adapter
      await adapter.attachFile(file);
    } catch (error) {
      console.error('Error attaching instructions as file:', error);
    } finally {
      setIsAttaching(false);
    }
  }, [adapter, instructions]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleCancel = useCallback(() => {
    // Regenerate instructions from tools to ensure consistency
    const originalInstructions = generateInstructions(tools);
    setInstructions(originalInstructions);
    setIsEditing(false);
  }, [tools]);

  return (
    <div className="rounded-lg bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 sidebar-card">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <Typography variant="h4" className="flex items-center text-slate-700 dark:text-slate-300">
          <Icon name="tools" size="sm" className="mr-1.5 text-purple-500" />
          Instructions
        </Typography>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="px-2 py-1 text-xs font-medium text-green-700 dark:text-green-500 bg-green-100 dark:bg-green-900/30 rounded hover:bg-green-200 dark:hover:bg-green-800/40 transition-colors">
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-2 py-1 text-xs font-medium text-red-700 dark:text-red-500 bg-red-100 dark:bg-red-900/30 rounded hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-500 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors">
                Edit
              </button>
              <button
                onClick={handleCopyToClipboard}
                disabled={isCopying}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded transition-colors',
                  isCopying
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    : 'text-amber-700 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40',
                )}>
                {isCopying ? (
                  <span className="flex items-center">
                    <Icon name="refresh" size="sm" className="animate-spin mr-1 text-slate-500 dark:text-slate-400" />
                    Copying
                  </span>
                ) : (
                  'Copy'
                )}
              </button>
              <button
                onClick={handleInsertInChat}
                disabled={isInserting}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded transition-colors',
                  isInserting
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    : 'text-green-700 dark:text-green-500 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-800/40',
                )}>
                {isInserting ? (
                  <span className="flex items-center">
                    <Icon name="refresh" size="sm" className="animate-spin mr-1 text-slate-500 dark:text-slate-400" />
                    Inserting
                  </span>
                ) : (
                  'Insert in chat'
                )}
              </button>
              <button
                onClick={handleAttachAsFile}
                disabled={isAttaching || !adapter.supportsFileUpload()}
                className={cn(
                  'px-2 py-1 text-xs font-medium rounded transition-colors',
                  isAttaching || !adapter.supportsFileUpload()
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    : 'text-purple-700 dark:text-purple-500 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-800/40',
                )}>
                {isAttaching ? (
                  <span className="flex items-center">
                    <Icon name="refresh" size="sm" className="animate-spin mr-1 text-slate-500 dark:text-slate-400" />
                    Attaching
                  </span>
                ) : (
                  'Attach as file'
                )}
              </button>
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
  );
};

export default InstructionManager;
