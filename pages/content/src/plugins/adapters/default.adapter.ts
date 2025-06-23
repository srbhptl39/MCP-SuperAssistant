import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability } from '../plugin-types';

export class DefaultAdapter extends BaseAdapterPlugin {
  readonly name = 'DefaultAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['*'];
  readonly capabilities: AdapterCapability[] = ['text-insertion', 'form-submission'];

  async insertText(text: string): Promise<boolean> {
    const activeElement = document.activeElement;

    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const inputElement = activeElement as HTMLInputElement | HTMLTextAreaElement;
      inputElement.value = text;
      
      // Trigger input event to ensure reactivity
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Emit event for tracking
      this.context.eventBus.emit('tool:execution-completed', {
        execution: {
          id: this.generateCallId(),
          toolName: 'insertText',
          parameters: { text },
          result: { success: true, elementType: activeElement.tagName },
          timestamp: Date.now(),
          status: 'success'
        }
      });
      
      this.context.logger.debug('Text inserted successfully into', activeElement.tagName);
      return true;
    }

    // Try to find any contenteditable element
    const editableElement = document.querySelector('[contenteditable="true"]') as HTMLElement;
    if (editableElement) {
      editableElement.textContent = text;
      
      // Trigger input event
      editableElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      this.context.eventBus.emit('tool:execution-completed', {
        execution: {
          id: this.generateCallId(),
          toolName: 'insertText',
          parameters: { text },
          result: { success: true, elementType: 'contenteditable' },
          timestamp: Date.now(),
          status: 'success'
        }
      });
      
      this.context.logger.debug('Text inserted successfully into contenteditable element');
      return true;
    }

    this.context.logger.warn('No suitable input element found for text insertion');
    this.context.eventBus.emit('tool:execution-failed', {
      toolName: 'insertText',
      error: 'No suitable input element found',
      callId: this.generateCallId()
    });
    
    return false;
  }

  async submitForm(): Promise<boolean> {
    const activeElement = document.activeElement;

    // Try to submit form containing the active element
    if (activeElement && (activeElement as HTMLInputElement).form) {
      try {
        const formElement = (activeElement as HTMLInputElement).form;
        if (formElement) {
          formElement.submit();
          
          this.context.eventBus.emit('tool:execution-completed', {
            execution: {
              id: this.generateCallId(),
              toolName: 'submitForm',
              parameters: {},
              result: { success: true, method: 'activeElement.form' },
              timestamp: Date.now(),
              status: 'success'
            }
          });
          
          this.context.logger.debug('Form submitted successfully via active element');
          return true;
        }
      } catch (error) {
        this.context.logger.error('Failed to submit form via active element:', error);
      }
    }

    // Try to find and click a submit button
    const submitButton = document.querySelector('button[type="submit"], input[type="submit"]') as HTMLButtonElement | HTMLInputElement;
    if (submitButton) {
      try {
        submitButton.click();
        
        this.context.eventBus.emit('tool:execution-completed', {
          execution: {
            id: this.generateCallId(),
            toolName: 'submitForm',
            parameters: {},
            result: { success: true, method: 'submitButton.click' },
            timestamp: Date.now(),
            status: 'success'
          }
        });
        
        this.context.logger.debug('Form submitted successfully via submit button');
        return true;
      } catch (error) {
        this.context.logger.error('Failed to submit form via submit button:', error);
      }
    }

    // Try to find any form and submit it
    const form = document.querySelector('form') as HTMLFormElement;
    if (form) {
      try {
        form.submit();
        
        this.context.eventBus.emit('tool:execution-completed', {
          execution: {
            id: this.generateCallId(),
            toolName: 'submitForm',
            parameters: {},
            result: { success: true, method: 'form.submit' },
            timestamp: Date.now(),
            status: 'success'
          }
        });
        
        this.context.logger.debug('Form submitted successfully via form element');
        return true;
      } catch (error) {
        this.context.logger.error('Failed to submit form via form element:', error);
      }
    }

    this.context.logger.warn('No form found to submit');
    this.context.eventBus.emit('tool:execution-failed', {
      toolName: 'submitForm',
      error: 'No form found to submit',
      callId: this.generateCallId()
    });
    
    return false;
  }

  protected async initializePlugin(): Promise<void> {
    this.context.logger.debug('Initializing DefaultAdapter...');
    // Basic initialization for default adapter
  }

  protected async activatePlugin(): Promise<void> {
    this.context.logger.debug('Activating DefaultAdapter...');
    // Set up any listeners or UI elements
  }

  protected async deactivatePlugin(): Promise<void> {
    this.context.logger.debug('Deactivating DefaultAdapter...');
    // Clean up listeners or UI elements
  }

  protected async cleanupPlugin(): Promise<void> {
    this.context.logger.debug('Cleaning up DefaultAdapter...');
    // Final cleanup
  }

  private generateCallId(): string {
    return `default-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
