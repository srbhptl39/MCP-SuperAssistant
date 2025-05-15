/**
 * AgentHustle-specific instructions for the MCP sidebar
 */

export const instructions = {
  title: 'AgentHustle MCP Instructions',
  description: `
    Welcome to the Model Context Protocol (MCP) integration for AgentHustle!
    
    This tool enhances your AgentHustle experience by providing additional capabilities
    through a set of powerful tools and commands.
    
    To use MCP tools:
    1. Type your query or command in the chat input
    2. The MCP sidebar will automatically detect and process tool commands
    3. Results will be inserted into your conversation
    
    Available tools include:
    - File operations (read, write, search)
    - Code analysis and search
    - Environment management
    - Web search and research
    - And more...
    
    The sidebar will remain hidden until tool commands are detected in your chat.
    You can also manually toggle the sidebar using the MCP button.
    
    Tips:
    - Use natural language to describe what you want to do
    - The AI will automatically select the appropriate tools
    - Results will be formatted and inserted into your chat
    
    For more information about available tools and commands,
    click the "Available Tools" section in the sidebar.
  `,
  examples: [
    {
      title: 'File Operations',
      description: 'Read, write, and search files',
      command: 'Can you read the contents of config.json?'
    },
    {
      title: 'Code Search',
      description: 'Search through codebase',
      command: 'Find all functions that handle user authentication'
    },
    {
      title: 'Web Search',
      description: 'Search the web for information',
      command: 'What are the latest updates to the AgentHustle API?'
    }
  ]
}; 