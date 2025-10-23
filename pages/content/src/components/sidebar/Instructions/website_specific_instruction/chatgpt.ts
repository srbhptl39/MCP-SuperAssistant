/**
 * Custom instructions for ChatGPT
 * This file contains specific instructions for the ChatGPT AI platform
 */

// Export the custom instructions for ChatGPT
export const chatgptInstructions = `
How SuperAssistant works:
  1. PRINT the function JSON event like function_calls to be executed as part of the output/response
  2. As part of your response there is a DOM observer tool which needs text to run that function manually, so make sure you print the function JSON events with correct function name, parameters and call_id.
  3. Upon Capturing the function JSON events, it will be executed with the call_id provided.
  4. The result of the function execution will be provided in <function_results> tag.
  5. DO NOT USE canvas / can mode.
  6. All other tools and functions are disabled except for the ones available to superassistant.
`;

// Compressed schema notation documentation will be added after this point
