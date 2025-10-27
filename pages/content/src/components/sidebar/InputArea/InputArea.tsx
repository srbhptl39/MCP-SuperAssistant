import type React from 'react';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardHeader, CardContent } from '@src/components/ui/card';
import { createLogger } from '@extension/shared/lib/logger';


const logger = createLogger('InputArea');

interface InputAreaProps {
  onSubmit: (text: string) => void;
  onToggleMinimize: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({ onSubmit, onToggleMinimize }) => {
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      setIsSubmitting(true);
      try {
        // Format as user input
        const processedText = `<user>\n${inputText}\n</user>`;

        // Wait 200ms before submitting
        await new Promise(resolve => setTimeout(resolve, 300));
        onSubmit(processedText);
        await new Promise(resolve => setTimeout(resolve, 100));
        setInputText('');
      } catch (error) {
        logger.error('Error submitting input:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // If Enter is pressed without Shift, submit the form
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
    // If Shift+Enter, allow default behavior (new line)
  };

  return (
    <Card className="mt-3 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <CardHeader className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between">
        <Typography variant="h4" className="flex items-center">
          <Icon name="menu" size="sm" className="mr-1.5 text-slate-700 dark:text-slate-300" />
          Input Area
        </Typography>
        {/* <Button variant="ghost" size="sm" onClick={onToggleMinimize}>
          <Icon name="chevron-down" size="sm" />
        </Button> */}
      </CardHeader>
      <CardContent className="p-3 bg-white dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="relative">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter your text here... (Press Enter to submit, Shift+Enter for new line)"
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-slate-400 dark:focus:border-slate-500 dark:bg-slate-800 dark:text-slate-200 bg-white text-slate-900"
              disabled={isSubmitting}
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !inputText.trim()}
            className={cn('px-4 py-2 h-9', isSubmitting || !inputText.trim() ? 'opacity-50' : '')}
            variant={isSubmitting || !inputText.trim() ? 'outline' : 'default'}>
            {isSubmitting ? (
              <>
                <Icon name="refresh" size="sm" className="animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Icon name="chevron-right" size="sm" className="mr-1.5" />
                Submit
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default InputArea;
