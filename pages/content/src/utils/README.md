# Utility Modules (`utils`)

This directory contains various utility modules and helper functions that provide common, reusable functionality across the MCP-SuperAssistant content script. These utilities help to keep the codebase DRY (Don't Repeat Yourself) and make common tasks easier to perform.

## Overview

Utility modules are typically small, focused, and provide pure functions or classes that encapsulate specific logic. They are designed to be easily imported and used wherever their functionality is needed.

## Common Utility Modules

While the exact contents can vary, common types of utility modules found in such a directory include:

- **`dom.ts`**: Functions for interacting with the Document Object Model (DOM). This might include helpers for:
    - Querying elements (e.g., `querySelector`, `querySelectorAll` wrappers).
    - Creating or modifying DOM elements.
    - Adding or removing event listeners.
    - Traversing the DOM tree.
    - Checking element visibility or properties.

- **`logger.ts`**: A custom logging utility. This could provide:
    - Different log levels (e.g., `debug`, `info`, `warn`, `error`).
    - Conditional logging based on environment (development/production).
    - Prefixed log messages for better context.
    - Integration with a remote logging service.

- **`string.ts`**: Helper functions for string manipulation, such as:
    - Formatting strings (e.g., capitalization, truncation).
    - Generating unique IDs or random strings.
    - Parsing or validating string formats.

- **`storage.ts`**: Utilities for interacting with browser storage (`localStorage`, `sessionStorage`, or `chrome.storage`). This might include:
    - Simplified `get`, `set`, and `remove` item functions.
    - Automatic JSON parsing/stringification for stored objects.

- **`url.ts`**: Functions for parsing and manipulating URLs, such as:
    - Extracting query parameters.
    - Joining URL paths.
    - Validating URL formats.

- **`async.ts` or `promises.ts`**: Helpers for working with asynchronous operations, like:
    - Debounce or throttle functions.
    - Promise-based delays (`sleep`).
    - Retry mechanisms for promises.

## Usage

To use a utility function, import it directly from its module file:

```typescript
// Example: Using a DOM utility
import { getElementById, addClass } from './dom'; // Assuming dom.ts exists

const myElement = getElementById('my-element-id');
if (myElement) {
  addClass(myElement, 'highlighted');
}

// Example: Using a logger utility
import logger from './logger'; // Assuming logger.ts exports a default logger instance

logger.info('[MyComponent] Component initialized successfully.');

// Example: Using a string utility
import { capitalizeFirstLetter } from './string'; // Assuming string.ts exists

const originalText = 'hello world';
const capitalizedText = capitalizeFirstLetter(originalText);
console.log(capitalizedText); // Output: Hello world
```

## Contribution

When adding new utility functions:

- **Keep them focused**: Each function should do one thing well.
- **Ensure they are generic**: Utilities should be broadly applicable and not tied to specific business logic unless they are in a very domain-specific utility module.
- **Add JSDoc comments**: Document what the function does, its parameters, and what it returns.
- **Consider unit tests**: For complex utilities, adding unit tests is highly recommended.

By centralizing common functionalities in this `utils` directory, the rest of the codebase can remain cleaner and more focused on its primary responsibilities.
