/**
 * AgentHustle Adapter
 * 
 * This adapter provides integration with agenthustle.ai/vip platform.
 */

import { BaseAdapter } from './common/baseAdapter';
import { logMessage } from '../utils/helpers';
import { SidebarManager } from '../components/sidebar/SidebarManager';
import {
  insertToolResultToChatInput,
  submitChatInput,
  supportsFileUpload as agentHustleSupportsFileUpload,
  attachFileToChatInput as agentHustleAttachFileToChatInput,
} from '../components/websites/agenthustle/chatInputHandler';
import { initAgentHustleComponents } from './adaptercomponents/agenthustle';

export class AgentHustleAdapter extends BaseAdapter {
  name = 'AgentHustle';
  hostname = 'agenthustle.ai';
  urlPatterns = [/^https?:\/\/(?:www\.)?agenthustle\.ai\/vip(?:\/.*)?$/];
  private urlCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.sidebarManager = SidebarManager.getInstance('agenthustle');
    
    // Initialize components
    initAgentHustleComponents();
    
    // Start URL check interval
    this.urlCheckInterval = setInterval(() => {
      // Check if we're still on an AgentHustle page
      if (!this.urlPatterns.some(pattern => pattern.test(window.location.href))) {
        this.cleanup();
      }
    }, 1000);
  }

  protected initializeObserver(forceReset: boolean = false): void {
    // Initialize observer for chat input and output elements
    logMessage('Initializing AgentHustle observer');
    
    // Add mutation observer to detect chat interface changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Handle chat interface changes
          this.handleChatInterfaceChanges();
        }
      }
    });

    // Start observing the chat container
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      observer.observe(chatContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  private handleChatInterfaceChanges(): void {
    // Handle any necessary UI updates when the chat interface changes
    logMessage('Chat interface changed, updating UI elements');
  }

  protected initializeSidebarManager(): void {
    if (this.sidebarManager) {
      this.sidebarManager.initialize();
    }
  }

  insertTextIntoInput(text: string): void {
    insertToolResultToChatInput(text);
  }

  triggerSubmission(): void {
    submitChatInput();
  }

  cleanup(): void {
    // Clear URL check interval
    if (this.urlCheckInterval) {
      window.clearInterval(this.urlCheckInterval);
      this.urlCheckInterval = null;
    }

    // Call parent cleanup
    super.cleanup();
  }

  /**
   * Check if AgentHustle supports file upload
   * @returns true if file upload is supported
   */
  supportsFileUpload(): boolean {
    return agentHustleSupportsFileUpload();
  }

  /**
   * Attach a file to the chat input
   * @param file The file to attach
   */
  async attachFile(file: File): Promise<boolean> {
    return agentHustleAttachFileToChatInput(file);
  }

  /**
   * Force a full document scan for tool commands
   */
  public forceFullScan(): void {
    logMessage('Forcing full document scan for AgentHustle');
  }
} 