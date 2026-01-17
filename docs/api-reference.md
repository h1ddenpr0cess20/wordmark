# API Reference

This document provides detailed API reference for the core modules in the rebrand architecture.

## Table of Contents

- [Request Client](#request-client)
- [Client Configuration](#client-configuration)
- [Message Utils](#message-utils)
- [Tool Manager](#tool-manager)
- [Streaming Utilities](#streaming-utilities)

---

## Request Client

**Module:** `src/js/services/api/requestClient.js`

Core network layer for communicating with the Responses API.

### buildRequestBody(options)

Constructs a Responses API request payload.

**Parameters:**
- `options.inputMessages` (Array) - Array of message objects
- `options.instructions` (string) - Optional system instructions
- `options.tools` (Array) - Array of tool definitions
- `options.model` (string) - Model identifier
- `options.verbosity` (string) - Response verbosity level
- `options.reasoningEffort` (string) - Reasoning effort for o-series models ('low', 'medium', 'high')
- `options.stream` (boolean) - Enable streaming responses
- `options.previousResponseId` (string) - Previous response ID for image continuations

**Returns:** Object - Request payload for Responses API

**Example:**
```javascript
const body = buildRequestBody({
  inputMessages: [{ role: 'user', content: 'Hello' }],
  model: 'gpt-4o',
  tools: enabledTools,
  stream: true,
  reasoningEffort: 'medium'
});
```

### buildHeaders()

Constructs HTTP headers for Responses API requests.

**Returns:** Object - Headers including Authorization and Content-Type

### executeStreamingRequest(body, abortController)

Executes a streaming Responses API request.

**Parameters:**
- `body` (Object) - Request payload from buildRequestBody
- `abortController` (AbortController) - Optional controller for request cancellation

**Returns:** Promise<Response> - Fetch response with streaming body

**Throws:** Error if response is not ok

### executeNonStreamingRequest(body, abortController)

Executes a non-streaming Responses API request.

**Parameters:**
- `body` (Object) - Request payload
- `abortController` (AbortController) - Optional controller for cancellation

**Returns:** Promise<Object> - Parsed JSON response

**Throws:** Error if response is not ok

### runTurn(options)

Main entry point for running a conversation turn. Handles multi-turn tool execution loops automatically.

**Parameters:**
- `options.inputMessages` (Array) - Conversation history
- `options.instructions` (string) - System instructions
- `options.model` (string) - Model to use
- `options.verbosity` (string) - Response verbosity
- `options.reasoningEffort` (string) - Reasoning effort level
- `options.stream` (boolean) - Enable streaming (default: true)
- `options.loadingId` (string) - DOM element ID for loading indicator
- `options.abortController` (AbortController) - Cancellation controller

**Returns:** Promise<Object> - `{ response, outputText, reasoningText }`

**Example:**
```javascript
const result = await runTurn({
  inputMessages: conversationHistory,
  model: 'gpt-4o',
  stream: true,
  loadingId: 'loading-msg-123'
});
```

---

## Client Configuration

**Module:** `src/js/services/api/clientConfig.js`

Service and model configuration helpers.

### getActiveServiceKey()

Returns the currently active service identifier.

**Returns:** string - Service key ('openai', 'xai', 'lmstudio', 'ollama')

### getActiveModel()

Returns the currently selected model.

**Returns:** string - Model identifier (e.g., 'gpt-4o', 'o1-preview')

### ensureApiKey()

Retrieves and validates the API key for the active service.

**Returns:** string - API key

**Throws:** Error if API key is not configured

### getBaseUrl()

Returns the API base URL for the active service.

**Returns:** string - Base URL (e.g., 'https://api.openai.com/v1')

### supportsReasoningEffort(modelName)

Checks if a model supports reasoning effort parameter.

**Parameters:**
- `modelName` (string) - Optional model name (uses active model if not provided)

**Returns:** boolean - True if model supports reasoning (o1, o2, o3, o4 series)

**Example:**
```javascript
if (supportsReasoningEffort('o1-preview')) {
  // Include reasoning configuration
}
```

---

## Message Utils

**Module:** `src/js/services/api/messageUtils.js`

Message serialization and formatting for Responses API.

### serializeMessagesForRequest(messages)

Converts conversation messages to Responses API format.

**Features:**
- Expands `[[IMAGE: filename]]` placeholders to `input_image` parts
- Handles inline image attachments as multimodal content
- Converts text-only messages to appropriate format

**Parameters:**
- `messages` (Array) - Array of message objects with role, content, attachments

**Returns:** Array - Serialized messages for API request

**Example:**
```javascript
const serialized = serializeMessagesForRequest([
  {
    role: 'user',
    content: 'Describe this: [[IMAGE: photo.jpg]]',
    attachments: [{
      filename: 'photo.jpg',
      dataUrl: 'data:image/jpeg;base64,...'
    }]
  }
]);
// Returns multimodal message with input_text and input_image parts
```

### collectFunctionCalls(responseOutput)

Extracts function/tool calls from Responses API output.

**Parameters:**
- `responseOutput` (Array) - Output array from response payload

**Returns:** Array - Function call objects with name, arguments, callId

### buildInstructions()

Constructs system instructions from personality settings.

**Returns:** string - System instructions text

### buildDeveloperMessage(model)

Builds developer/system message with context (personality, location, timestamp).

**Parameters:**
- `model` (string) - Model identifier

**Returns:** string - Developer message content

---

## Tool Manager

**Module:** `src/js/services/api/toolManager.js`

Tool catalog management and MCP server integration.

### getToolCatalog()

Returns the complete tool catalog for UI display.

**Returns:** Array - Tool metadata objects with:
- `key` (string) - Unique tool identifier
- `type` (string) - Tool type ('function', 'builtin', 'mcp')
- `displayName` (string) - Human-readable name
- `description` (string) - Tool description
- `defaultEnabled` (boolean) - Default enabled state
- `isOnline` (boolean|null) - MCP server availability
- `onlyServices` (Array) - Service restrictions
- `serverUrl` (string) - MCP server URL (for mcp type)

### isToolEnabled(key)

Checks if a tool is currently enabled.

**Parameters:**
- `key` (string) - Tool identifier

**Returns:** boolean - True if enabled

### setToolEnabled(key, enabled)

Enables or disables a specific tool.

**Parameters:**
- `key` (string) - Tool identifier
- `enabled` (boolean) - Desired state

### setAllToolsEnabled(enabled)

Bulk enable/disable all tools.

**Parameters:**
- `enabled` (boolean) - Desired state for all tools

### registerMcpServer(serverConfig, options)

Registers a new MCP server as a tool.

**Parameters:**
- `serverConfig` (Object)
  - `server_label` (string) - Unique server identifier
  - `server_url` (string) - Server endpoint URL
  - `displayName` (string) - Display name
  - `description` (string) - Server description
  - `require_approval` (string) - Approval setting
- `options` (Object)
  - `silent` (boolean) - Skip UI updates

**Returns:** Object - Tool entry or null

**Example:**
```javascript
registerMcpServer({
  server_label: 'weather-api',
  server_url: 'http://localhost:3000',
  displayName: 'Weather API',
  description: 'Real-time weather data'
});
```

### unregisterMcpServer(serverLabel, options)

Removes an MCP server from the catalog.

**Parameters:**
- `serverLabel` (string) - Server identifier
- `options.silent` (boolean) - Skip preference cleanup

**Returns:** boolean - True if removed

### getEnabledToolDefinitions(serviceKey, modelName)

Returns tool definitions for enabled tools compatible with the specified service.

**Parameters:**
- `serviceKey` (string) - Service identifier (default: active service)
- `modelName` (string) - Model identifier used to apply provider-specific restrictions (default: active model)

**Returns:** Array - Tool definitions for API request

**Features:**
- Filters by service compatibility (onlyServices)
- Excludes offline MCP servers
- Excludes local MCP servers when using cloud services
- Handles xAI special cases (web_search + x_search inclusion)
- Disables OpenAI image generation when Codex models are active

### refreshMcpAvailability(force)

Pings MCP servers to check availability.

**Parameters:**
- `force` (boolean) - Force refresh ignoring cache

**Returns:** Promise - Resolves when checks complete

---

## Streaming Utilities

**Module:** `src/js/services/streaming/thinkingUtils.js`

Utilities for rendering streamed content.

### processMainContentMarkdown(mainText)

Processes and sanitizes markdown content for display.

**Features:**
- Closes unclosed code blocks and inline code
- Parses markdown to HTML using marked.js
- Sanitizes HTML with DOMPurify
- Hides `[[IMAGE: filename]]` placeholders with CSS class
- Loads marked.js lazily if needed

**Parameters:**
- `mainText` (string) - Raw markdown text

**Returns:** string - Sanitized HTML

**Example:**
```javascript
const html = processMainContentMarkdown('**Bold** and `code`');
// Returns: '<p><strong>Bold</strong> and <code>code</code></p>'
```

---

## Error Handling

All API functions throw errors with descriptive messages:

```javascript
try {
  const result = await runTurn({ ... });
} catch (error) {
  if (error.name === 'AbortError') {
    // Request was cancelled
  } else {
    // Network or API error
    console.error('API error:', error.message);
  }
}
```

## Service-Specific Behavior

### OpenAI
- Supports all tool types (function, builtin, mcp)
- Includes default fields in request payload
- Uses 'developer' role for system messages
- Disables image generation tool when Codex models are active

### xAI (Grok)
- Uses 'system' role instead of 'developer'
- Provides both web_search and x_search tools
- Supports MCP tools (remote endpoints, same local-network restrictions as other cloud services)
- Removes text.format when using server-side tools (web/X search, Code Interpreter, MCP)
- Omits Code Interpreter container metadata (xAI manages runtime automatically)
- Excludes default include fields

### LM Studio
- Local server at configurable URL
- No API key required
- Supports function tools and MCP servers
- No builtin tool support

### Ollama
- Local server at `http://localhost:11434/v1` by default
- No API key required
- Supports function tools and MCP servers
- No builtin tool support

## Testing

Run tests with:
```bash
npm test
```

Test files:
- `tests/requestClient.spec.js` - Request client tests
- `tests/clientConfig.spec.js` - Configuration tests
- `tests/messageUtils.spec.js` - Message serialization tests
- `tests/toolManager.spec.js` - Tool management tests
- `tests/thinkingUtils.spec.js` - Markdown processing tests
