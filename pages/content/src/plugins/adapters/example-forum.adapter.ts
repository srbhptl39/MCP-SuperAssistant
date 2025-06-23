import { BaseAdapterPlugin } from './base.adapter';
import type { AdapterCapability, PluginContext } from '../plugin-types';

export class ExampleForumAdapter extends BaseAdapterPlugin {
  readonly name = 'ExampleForumAdapter';
  readonly version = '1.0.0';
  readonly hostnames = ['forum.example.com', 'www.forum.example.com']; // Specific hostnames for this adapter
  readonly capabilities: AdapterCapability[] = [
    'text-insertion', 
    'form-submission', 
    'url-navigation', // Can navigate to specific URLs
    'dom-manipulation' // Might need to interact with specific DOM elements
  ];

  constructor() {
    super();
    // Additional initialization specific to ExampleForumAdapter
  }

  // Override or implement methods specific to ExampleForum
  async insertText(text: string, options?: { targetElement?: HTMLElement }): Promise<boolean> {
    this.context.logger.debug(`Attempting to insert text into ${options?.targetElement ? 'specified element' : 'active element'}`);
    let targetElement: HTMLElement | null = null;

    if (options?.targetElement) {
      targetElement = options.targetElement;
    } else {
      targetElement = document.activeElement as HTMLElement;
    }

    if (targetElement && (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA')) {
      (targetElement as HTMLInputElement | HTMLTextAreaElement).value = text;
      targetElement.dispatchEvent(new Event('input', { bubbles: true })); // Ensure reactivity
      this.context.logger.debug('Text inserted successfully.');
      
      // Emit event for tracking
      this.context.eventBus.emit('tool:execution-completed', {
        execution: {
          id: this.generateCallId(),
          toolName: 'insertText',
          parameters: { text },
          result: { success: true },
          timestamp: Date.now(),
          status: 'success'
        }
      });
      
      return true;
    }
    this.context.logger.error('Failed to insert text. Target element not suitable or not found.');
    return false;
  }

  async navigateToThread(threadId: string): Promise<boolean> {
    if (!this.capabilities.includes('url-navigation')) {
      this.context.logger.error('URL navigation capability is not available for this adapter.');
      return false;
    }
    const threadUrl = `https://${this.hostnames[0]}/threads/${threadId}`;
    this.context.logger.debug(`Navigating to thread: ${threadUrl}`);
    try {
      // Assuming a utility or direct window.location change
      // For extensions, this might involve sending a message to the background script
      // or using a helper from PluginContext if available for navigation.
      if (this.context?.chrome?.tabs) {
        const currentTab = await this.context.chrome.tabs.getCurrent();
        if (currentTab?.id) {
          await this.context.chrome.tabs.update(currentTab.id, { url: threadUrl });
          return true;
        }
      } else {
        window.location.href = threadUrl;
        return true;
      }
      return false;
    } catch (error) {
      this.context.logger.error('Failed to navigate to thread.', error);
      return false;
    }
  }

  async postReply(threadId: string, content: string): Promise<boolean> {
    this.context.logger.debug(`Attempting to post reply to thread ${threadId}`);
    // 1. Navigate to the thread (or ensure we are on the correct page)
    // await this.navigateToThread(threadId); // Potentially

    // 2. Find the reply textarea (highly specific to ExampleForum's DOM structure)
    const replyTextArea = document.querySelector<HTMLTextAreaElement>('#reply-textarea-selector'); // Placeholder selector
    if (!replyTextArea) {
      this.context.logger.error('Reply textarea not found.');
      return false;
    }

    // 3. Insert the content
    replyTextArea.value = content;
    replyTextArea.dispatchEvent(new Event('input', { bubbles: true }));

    // 4. Find and click the submit button
    const submitButton = document.querySelector<HTMLButtonElement>('#reply-submit-button-selector'); // Placeholder selector
    if (!submitButton) {
      this.context.logger.error('Reply submit button not found.');
      return false;
    }
    submitButton.click();
    this.context.logger.debug('Reply submitted successfully.');
    
    // Emit event for tracking
    this.context.eventBus.emit('tool:execution-completed', {
      execution: {
        id: this.generateCallId(),
        toolName: 'postReply',
        parameters: { threadId, content },
        result: { success: true },
        timestamp: Date.now(),
        status: 'success'
      }
    });
    
    return true;
  }

  async extractThreadTitle(): Promise<string | null> {
    try {
      // Look for common thread title selectors in forums
      const titleSelectors = [
        'h1.thread-title',
        '.thread-header h1',
        '[data-thread-title]',
        '.post-title h1',
        '.topic-title'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = document.querySelector<HTMLElement>(selector);
        if (titleElement) {
          return titleElement.textContent?.trim() || null;
        }
      }
      
      // Fallback to page title
      return document.title || null;
    } catch (error) {
      this.context.logger.error('Failed to extract thread title:', error);
      return null;
    }
  }

  protected async initializePlugin(): Promise<void> {
    this.context.logger.debug('Initializing ExampleForumAdapter...');
    // Specific initialization, e.g., check for forum-specific global JS objects or DOM elements
    
    // Check if we're on a forum page
    const forumIndicators = [
      '.forum-container',
      '.thread-list',
      '.post-container',
      '[data-forum]'
    ];
    
    const isForumPage = forumIndicators.some(selector => document.querySelector(selector));
    if (isForumPage) {
      this.context.logger.debug('Forum page detected, adapter ready for forum-specific operations');
    } else {
      this.context.logger.warn('Forum indicators not found, adapter may have limited functionality');
    }
  }

  protected async activatePlugin(): Promise<void> {
    this.context.logger.debug('Activating ExampleForumAdapter...');
    // Add event listeners specific to forum interactions, if needed
    
    // Listen for thread navigation
    document.addEventListener('click', this.handleThreadClick.bind(this));
    
    // Listen for form submissions
    document.addEventListener('submit', this.handleFormSubmit.bind(this));
  }

  protected async deactivatePlugin(): Promise<void> {
    this.context.logger.debug('Deactivating ExampleForumAdapter...');
    // Remove event listeners added during activation
    
    document.removeEventListener('click', this.handleThreadClick.bind(this));
    document.removeEventListener('submit', this.handleFormSubmit.bind(this));
  }

  protected async cleanupPlugin(): Promise<void> {
    this.context.logger.debug('Cleaning up ExampleForumAdapter...');
    // Final cleanup - already handled in deactivatePlugin for this adapter
  }

  private handleThreadClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.matches('a[href*="/threads/"]')) {
      const href = target.getAttribute('href');
      if (href) {
        this.context.logger.debug(`Thread link clicked: ${href}`);
        // Could emit an event here for tracking
        this.context.eventBus.emit('app:site-changed', {
          site: href,
          hostname: window.location.hostname
        });
      }
    }
  }

  private handleFormSubmit(event: Event): void {
    const form = event.target as HTMLFormElement;
    if (form.matches('.reply-form, .post-form')) {
      this.context.logger.debug('Forum form submission detected');
      // Could emit an event here for tracking
      this.context.eventBus.emit('tool:execution-completed', {
        execution: {
          id: this.generateCallId(),
          toolName: 'formSubmit',
          parameters: { formType: 'forum' },
          result: { success: true },
          timestamp: Date.now(),
          status: 'success'
        }
      });
    }
  }

  private generateCallId(): string {
    return `example-forum-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
