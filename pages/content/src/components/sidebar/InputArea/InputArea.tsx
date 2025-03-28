import React, { useState } from 'react';
import { Typography, Icon, Button } from '../ui';
import { cn } from '@src/lib/utils';
import { Card, CardHeader, CardContent } from '@src/components/ui/card';

type InputMode = 'Command' | 'Ask' | 'None';

interface InputAreaProps {
  onSubmit: (text: string) => void;
}

const InputArea: React.FC<InputAreaProps> = ({ onSubmit }) => {
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<InputMode>('Command');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      setIsSubmitting(true);
      try {
        let processedText = inputText;
        
        if (mode === 'Command') {
          processedText = `<command>\n${inputText}\n</command>`;
        } else if (mode === 'Ask') {
          processedText = `<Ask>\n${inputText}\n</Ask>`;
        }
        
        // Wait 200ms before submitting
        await new Promise(resolve => setTimeout(resolve, 300));
        onSubmit(processedText);
        await new Promise(resolve => setTimeout(resolve, 100));
        setInputText('');
      } catch (error) {
        console.error('Error submitting input:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Card className="mt-3 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <CardHeader className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Typography variant="h4" className="flex items-center">
          <Icon name="menu" size="sm" className="mr-1.5 text-slate-700 dark:text-slate-300" />
          Input Area
        </Typography>
      </CardHeader>
      <CardContent className="p-3 bg-white dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="mb-2">
            <label htmlFor="mode-select" className="block text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 mb-1">
              Mode
            </label>
            <select
              id="mode-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as InputMode)}
              className="w-full px-3 py-2 text-sm border text-slate-900 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-slate-400 dark:focus:border-slate-500  dark:text-slate-200"
            >
              <option value="Command">Command</option>
              <option value="Ask">Ask</option>
              <option value="None">None</option>
            </select>
          </div>
          <div className="relative">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Enter your text here..."
              className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-md min-h-[100px] resize-y focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-slate-500 focus:border-slate-400 dark:focus:border-slate-500 dark:bg-slate-800 dark:text-slate-200 bg-white text-slate-900"
              disabled={isSubmitting}
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !inputText.trim()}
            className={cn(
              'px-4 py-2 h-9',
              isSubmitting || !inputText.trim() ? 'opacity-50' : ''
            )}
            variant={isSubmitting || !inputText.trim() ? "outline" : "default"}
          >
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
