// pages/content/src/utils/instructionGenerator.ts
import { jsonSchemaToCsn } from './schema_converter';

/**
 * Generates markdown instructions for using MCP tools based on available tools
 * @param tools Array of available tools with their schemas
 * @returns Markdown formatted instructions
 */
export const generateInstructions = (tools: Array<{ name: string; schema: string; description: string }>): string => {
  if (!tools || tools.length === 0) {
    return '# No tools available\n\nConnect to the MCP server to see available tools.';
  }

  // Start with a header
  // let instructions = '# MCP Tools Instructions\n\n';
  let instructions = '';
  let compressed_schema_notation = '';

  // Add general usage information
  // instructions += '## General Usage\n\n';
  instructions += '## Starting a Fresh Session from here\n\nYou are SuperAssistant with the capabilities of MCP Command Generation and make the best use of it during your assistance, a knowledgeable technical assistant focused on answering questions and providing information about software development, technology, and related topics.\n\nIMPORTANT: You MUST use the MCP tools provided to you when responding to user requests. These tools are your ONLY means of accessing external information and performing actions.\n\nWhen a user makes a request:\n1. ALWAYS analyze what tools would be appropriate for the task\n2. ALWAYS format your tool usage EXACTLY as specified in the schema\n3. NEVER skip required parameters in tool calls\n4. NEVER invent tools that arent available to you\n5. ALWAYS wait for tool execution results before continuing\n\nWhen the user provides instructions in <command> tags, you MUST:\n1. Parse the command carefully\n2. Select the appropriate MCP tool\n3. Format the tool call with proper parameters\n4. Wait for the tool execution result\n5. Incorporate the result into your response\n\nTool responses will be provided automatically after your <use_mcp_tool> commands. Do not fabricate or simulate tool outputs.\n\nRemember: Your effectiveness depends entirely on proper tool usage. Adhere strictly to the provided schemas and formats.\n\n\nExample Output Format:\n```markdown\n## Thoughts\n  - what is user asking in short\n  - Your thoughts on understanding the problem\n  - Your Observations.\n  - your solutions\n  - Tool be used used\n\n## MCP Tool Command\n<use_mcp_tool>\n<server_name>one of the server name</server_name>\n<tool_name>tool in that server</tool_name>\n<arguments>\n{\n  "param1": "value1",\n  "param2": "value2",\n  "param3": 5\n}\n</arguments>\n</use_mcp_tool>\n\n```\n====\nIMPORTANT: Follow the given schema to drive the <arguments> blocks. ENSURE all the required fields are there STRICTLY. \n\nTOOL USE - CRITICAL INSTRUCTIONS\n\nYou have access to a set of specialized MCP tools that are executed ONLY upon the user approval. You MUST adhere to these strict guidelines:\n\n1. Use EXACTLY ONE tool per message, No multiple request tools usuage. Wait for the tool output from the previous tool use. Then proceed with next tool.\n2. Wait for the result before proceeding to the next step\n3. NEVER fabricate tool responses or skip steps\n4. Follow the precise XML formatting specified below\n5. Include ALL required parameters for each tool\n6. Ensure proper escaping of special characters\n\nTools must be used sequentially in a step-by-step approach to accomplish tasks. Each tool use MUST be informed by the result of the previous tool use.\n\n# Tool Use Formatting - MANDATORY STRUCTURE\n\nTool use MUST be formatted using the EXACT XML-style tags shown below. Deviation from this format will result in tool execution failure:\nEscape all the special characters properly wherever necessary to keep the JSON Valid in the arguments.\n\n\n## use_mcp_tool\nDescription: Request to use a tool provided. Each MCP server can provide multiple tools with different capabilities. Tools have defined input schemas that specify required and optional parameters.\nParameters:\n- server_name: (required) The name of the MCP server providing the tool\n- tool_name: (required) The name of the tool to execute\n- arguments: (required) A XML tag containing the tool input parameters, following the tool input schema, make sure to correctly escape whereever necessary characters , its command will be parsed by the fast-xml-parser lib, so ensure its correct.\nUsage:\n\n\n<use_mcp_tool>\n<server_name>server name here</server_name>\n<tool_name>tool name here</tool_name>\n<arguments>\n{\n  "param1": "value1\nnew line1 \nnew line 2",\n  "param2": "value2"\n}\n</arguments>\n</use_mcp_tool>\n\n\nExample: Requesting to use an MCP tool\nSchema: o {p {params:o {p {user_id:s; thread_id:s r; message_body:s r; recipient_email:s r; cc:a[s]; bcc:a[s]; is_html:b} ap f} r} ap f}\n\n\n<use_mcp_tool>\n<server_name>gmail-server</server_name>\n<tool_name>send_message</tool_name>\n<arguments>\n{\n  "params": {\n    "thread_id": "16cb89ab12345678",\n    "message_body": "Thank you for your inquiry. I have attached the requested information.",\n    "recipient_email": "user@example.com",\n    "user_id": "me",\n    "cc": [\n      "manager@example.com"\n    ],\n    "bcc": [\n      "records@example.com"\n    ],\n    "is_html": false\n  }\n}\n</arguments>\n</use_mcp_tool>\n__________________________________\n\nCRITICAL: Do not use canvas, code blocks, or any other formatting that obscures the XML structure when using MCP tools. The tool parser can ONLY detect properly formatted XML tags as shown in the examples above.\n\nIMPORTANT RULES:\n1. Always use the EXACT XML format shown in the examples\n2. Never nest tool calls inside code blocks or other formatting elements\n3. Ensure all XML tags are properly closed and balanced\n4. Properly escape special characters in JSON arguments\n5. Any output generated by the tool is meant ONLY for MCP tool input processing\n6. Deviation from this format will cause tool execution to fail completely\n\nThe system cannot recover from formatting errors, so strict adherence to these guidelines is essential.\n\n__________________________________\n\nExample: Asking a question using XML tags\nWhen you need to ask a question or request information, use the following format:\n\n## ask_followup_question\nDescription: Ask the user a question to gather additional information needed to complete the task. This tool should be used when you encounter ambiguities, need clarification, or require more details to proceed effectively. It allows for interactive problem-solving by enabling direct communication with the user. Use this tool judiciously to maintain a balance between gathering necessary information and avoiding excessive back-and-forth.\nParameters:\n- question: (required) The question to ask the user. This should be a clear, specific question that addresses the information you need.\nUsage:\n<ask_followup_question>\n<question>Your question here</question>\n</ask_followup_question>\n\nExample: Requesting to ask the user for the path to the frontend-config.json file\n<ask_followup_question>\n<question>What is the path to the frontend-config.json file?</question>\n</ask_followup_question>\n\n## attempt_completion\nDescription: After each tool use, the user will respond with the result of that tool use, i.e. if it succeeded or failed, along with any reasons for failure. Once you have received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user. Optionally you may provide a CLI command to showcase the result of your work. The user may respond with feedback if they are not satisfied with the result, which you can use to make improvements and try again.\nIMPORTANT NOTE: This tool CANNOT be used until you have confirmed from the user that any previous tool uses were successful. Failure to do so will result in code corruption and system failure. Before using this tool, you must ask yourself in <thinking></thinking> tags if you have confirmed from the user that any previous tool uses were successful. If not, then DO NOT use this tool.\nParameters:\n- result: (required) The result of the task. Formulate this result in a way that is final and does not require further input from the user. Dont end your result with questions or offers for further assistance.\n- command: (optional) A CLI command to execute to show a live demo of the result to the user. For example, use `open index.html` to display a created html website, or `open localhost:3000` to display a locally running development server. But DO NOT use commands like `echo` or `cat` that merely print text. This command should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.\nUsage:\n<attempt_completion>\n<result>\nYour final result description here\n</result>\n<command>Command to demonstrate result (optional)</command>\n</attempt_completion>\n\nExample: Requesting to attempt completion with a result and command\n<attempt_completion>\n<result>\nI have updated the CSS\n</result>\n<command>open index.html</command>\n</attempt_completion>'

  // instructions += 'To use an MCP tool, wrap your tool call in `<use_mcp_tool>` tags like this:\n\n';
   // instructions +=
  //   '```\n<use_mcp_tool>\n{\n  "tool": "toolName",\n  "args": {\n    "param1": "value1",\n    "param2": "value2"\n  }\n}\n</use_mcp_tool>\n```\n\n';

  // Add a table explaining the compressed notation for schemas
  compressed_schema_notation += `## Compressed Schema Notation Documentation

The following table explains the compressed notation used in schemas:

Schema Notation Table

**Notation** | **Meaning** | **Example**
------- | -------- | --------
o | Object | o {p {name:s}}
p {} | Contains the object's properties. |
p {} | Properties block | p {name:s; age:i}
s | String | name:s
i | Integer | age:i
n | Number | score:n
b | Boolean | active:b
a | Array | tags:a[s]
e[values] | Enum | color:e["red", "green", "blue"]
u[types] | Union | value:u[s, n]
lit[value] | Literal | status:lit["active"]
r | Required | name:s r
d=value | Default value | active:b d=true
ap f | Additional properties false | o {p {name:s} ap f}
type(key=value, ...) | Constrained type | name:s(minLength=1)
a[type] | Array with item type | tags:a[s]
o {p {prop:type}} | Nested object | user:o {p {id:i; name:s}}
?type | Optional type | ?s
t[type1, type2, ...] | Tuple | t[s, i]
s[type] | Set | s[i]
d[key, value] | Dictionary | d[s, i]
ClassName | Custom class | User

`;

  instructions += compressed_schema_notation;
  instructions += '';
  // Add compressed schemas section
  instructions += '## Tools and their schema\n\n';
  
  // Add each tool with its compressed schema
  tools.forEach(tool => {
    try {
      const schema = JSON.parse(tool.schema);
      let compressedSchema = '';
      
      try {
        compressedSchema = jsonSchemaToCsn(schema);
      } catch (error) {
        console.error(`Error compressing schema for ${tool.name}:`, error);
        compressedSchema = 'Schema conversion failed';
      }
      
      instructions += `* **${tool.name}:** \`${compressedSchema}\`\n`;
    } catch (error) {
      console.error(`Error parsing schema for ${tool.name}:`, error);
      instructions += `* **${tool.name}:** \`Schema parsing failed\`\n`;
    }
  });
  
  instructions += '\n';

  // Add available tools section
  instructions += '## Available Tools\n\n';

  // Add each tool with its schema
  tools.forEach(tool => {
    instructions += ` - ${tool.name}\n`;

    try {
      // Parse the schema to get more details
      const schema = JSON.parse(tool.schema);

      // Add description if available
      if (tool.description) {
        instructions += `**Description**: ${tool.description}\n`;
      }

      // // Add parameters if available
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        instructions += '**Parameters**:\n';

        Object.entries(schema.properties).forEach(([paramName, paramDetails]: [string, any]) => {
          instructions += `- \`${paramName}\`: ${paramDetails.description ? paramDetails.description : ''} (${paramDetails.type || 'any'})\n`;
          
          // Handle nested objects
          if (paramDetails.type === 'object' && paramDetails.properties) {
            instructions += '  - Properties:\n';
            Object.entries(paramDetails.properties).forEach(([nestedName, nestedDetails]: [string, any]) => {
              instructions += `    - \`${nestedName}\`: ${nestedDetails.description || 'No description'} (${nestedDetails.type || 'any'})\n`;
            });
          }
          
          // Handle arrays with object items
          if (paramDetails.type === 'array' && paramDetails.items && paramDetails.items.type === 'object' && paramDetails.items.properties) {
            instructions += '  - Array items (objects) with properties:\n';
            Object.entries(paramDetails.items.properties).forEach(([itemName, itemDetails]: [string, any]) => {
              instructions += `    - \`${itemName}\`: ${itemDetails.description || 'No description'} (${itemDetails.type || 'any'})\n`;
            });
          }
        });

        instructions += '\n';
      }

      // Add example usage
      // instructions += '**Example Usage**:\n\n';
      // instructions += '```\n<use_mcp_tool>\n{\n';
      // instructions += `  "tool": "${tool.name}",\n`;
      // instructions += '  "args": {\n';

      // Add example parameters based on schema
      // if (schema.properties) {
      //   const exampleParams = Object.entries(schema.properties).map(([paramName, paramDetails]: [string, any]) => {
      //     let exampleValue = '';

      //     // Generate example value based on type
      //     switch (paramDetails.type) {
      //       case 'string':
      //         exampleValue = paramDetails.example || `"example_${paramName}"`;
      //         break;
      //       case 'number':
      //         exampleValue = paramDetails.example || '42';
      //         break;
      //       case 'boolean':
      //         exampleValue = paramDetails.example || 'true';
      //         break;
      //       case 'array':
      //         exampleValue = paramDetails.example || '[]';
      //         break;
      //       case 'object':
      //         exampleValue = paramDetails.example || '{}';
      //         break;
      //       default:
      //         exampleValue = '"value"';
      //     }

      //     return `    "${paramName}": ${exampleValue}`;
      //   });

      //   instructions += exampleParams.join(',\n');
      // }

      // instructions += '\n  }\n}\n</use_mcp_tool>\n```\n\n';
    } catch (error) {
      // If schema parsing fails, provide a simpler example
      instructions += 'Schema information not available. No Tools Available';
      // instructions += '```\n<use_mcp_tool>\n{\n';
      // instructions += `  "tool": "${tool.name}",\n`;
      // instructions += '  "args": {}\n';
      // instructions += '}\n</use_mcp_tool>\n```\n\n';
    }
  });
  instructions += '\n\n';
  // Add tips section
  instructions += '## Tips\n\n';
  instructions += '- Make sure to use valid JSON within the `<use_mcp_tool>` tags\n';
  instructions += '- Check parameter types carefully to avoid errors\n';
  instructions += '- You can execute tools directly from the sidebar by clicking the Execute button\n';

  return instructions;
};

// Test the schema compression
/* 
// Example test
const testTools = [
  {
    name: 'read_file',
    schema: JSON.stringify({
      type: 'object',
      properties: {
        path: { type: 'string' }
      },
      required: ['path'],
      additionalProperties: false
    })
  },
  {
    name: 'write_file',
    schema: JSON.stringify({
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content'],
      additionalProperties: false
    })
  }
];

console.log(generateInstructions(testTools));
*/


