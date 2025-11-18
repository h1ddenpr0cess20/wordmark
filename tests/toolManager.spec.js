import test from 'node:test';
import assert from 'node:assert/strict';

// Mock global dependencies
globalThis.window = {
  config: {
    enableFunctionCalling: true,
  },
  weatherToolHandler: async () => ({ forecast: 'sunny' }),
  getMemoryConfig: () => ({ enabled: false }),
  VERBOSE_LOGGING: false,
  MCP_ASSUME_ONLINE: false,
};

// Mock localStorage
globalThis.localStorage = {
  storage: {},
  getItem(key) {
    return this.storage[key] || null;
  },
  setItem(key, value) {
    this.storage[key] = value;
  },
  removeItem(key) {
    delete this.storage[key];
  },
  clear() {
    this.storage = {};
  },
};

const {
  getToolCatalog,
  isToolEnabled,
  setToolEnabled,
  setAllToolsEnabled,
  registerMcpServer,
  unregisterMcpServer,
  getEnabledToolDefinitions,
} = await import('../src/js/services/api/toolManager.js');

test('getToolCatalog returns array of tools', () => {
  const catalog = getToolCatalog();

  assert.ok(Array.isArray(catalog), 'catalog should be an array');
  assert.ok(catalog.length > 0, 'catalog should not be empty');

  const weatherTool = catalog.find(tool => tool.key === 'function:open_meteo_forecast');
  assert.ok(weatherTool, 'should include weather tool');
  assert.equal(weatherTool.type, 'function', 'weather tool should be function type');
  assert.ok(weatherTool.displayName, 'tool should have display name');
});

test('getToolCatalog includes builtin tools', () => {
  const catalog = getToolCatalog();

  const webSearch = catalog.find(tool => tool.key === 'builtin:web_search');
  assert.ok(webSearch, 'should include web_search');

  const codeInterpreter = catalog.find(tool => tool.key === 'builtin:code_interpreter');
  assert.ok(codeInterpreter, 'should include code_interpreter');

  const imageGen = catalog.find(tool => tool.key === 'builtin:image_generation');
  assert.ok(imageGen, 'should include image_generation');
});

test('isToolEnabled returns default state for unconfigured tools', () => {
  const weatherEnabled = isToolEnabled('function:open_meteo_forecast');
  assert.equal(weatherEnabled, true, 'weather tool should be enabled by default');

  const webSearchEnabled = isToolEnabled('builtin:web_search');
  assert.equal(webSearchEnabled, false, 'web_search should be disabled by default');
});

test('setToolEnabled changes tool state', () => {
  const key = 'function:open_meteo_forecast';

  setToolEnabled(key, false);
  assert.equal(isToolEnabled(key), false, 'tool should be disabled');

  setToolEnabled(key, true);
  assert.equal(isToolEnabled(key), true, 'tool should be enabled');
});

test('setAllToolsEnabled affects all tools', () => {
  setAllToolsEnabled(true);

  const catalog = getToolCatalog();
  catalog.forEach(tool => {
    if (!tool.hidden) {
      assert.equal(isToolEnabled(tool.key), true, `${tool.key} should be enabled`);
    }
  });

  setAllToolsEnabled(false);
  catalog.forEach(tool => {
    if (!tool.hidden) {
      assert.equal(isToolEnabled(tool.key), false, `${tool.key} should be disabled`);
    }
  });
});

test('registerMcpServer adds new MCP tool', () => {
  const serverConfig = {
    server_label: 'test-server',
    server_url: 'http://localhost:3000',
    displayName: 'Test Server',
    description: 'A test MCP server',
    require_approval: 'always',
  };

  const entry = registerMcpServer(serverConfig, { silent: true });

  assert.ok(entry, 'should return tool entry');
  assert.equal(entry.key, 'mcp:test-server', 'should have correct key format');
  assert.equal(entry.type, 'mcp', 'should be mcp type');

  const catalog = getToolCatalog();
  const mcpTool = catalog.find(tool => tool.key === 'mcp:test-server');
  assert.ok(mcpTool, 'MCP tool should appear in catalog');
  assert.equal(mcpTool.serverUrl, 'http://localhost:3000', 'should include server URL');
});

test('unregisterMcpServer removes MCP tool', () => {
  const serverConfig = {
    server_label: 'temp-server',
    server_url: 'http://localhost:4000',
  };

  registerMcpServer(serverConfig, { silent: true });

  let catalog = getToolCatalog();
  assert.ok(catalog.find(tool => tool.key === 'mcp:temp-server'), 'tool should exist');

  const removed = unregisterMcpServer('temp-server', { silent: true });
  assert.equal(removed, true, 'should successfully remove tool');

  catalog = getToolCatalog();
  assert.equal(catalog.find(tool => tool.key === 'mcp:temp-server'), undefined, 'tool should be removed');
});

test('getEnabledToolDefinitions filters by service', () => {
  // Enable all tools
  setAllToolsEnabled(true);

  // Get definitions for OpenAI
  const openaiTools = getEnabledToolDefinitions('openai');
  assert.ok(Array.isArray(openaiTools), 'should return array');

  // OpenAI should have web_search
  const hasWebSearch = openaiTools.some(tool => tool.type === 'web_search');
  assert.equal(hasWebSearch, true, 'OpenAI should support web_search');

  // Get definitions for LM Studio (local)
  const lmstudioTools = getEnabledToolDefinitions('lmstudio');

  // LM Studio should not have builtin tools
  const hasBuiltin = lmstudioTools.some(tool =>
    tool.type === 'web_search' || tool.type === 'code_interpreter'
  );
  assert.equal(hasBuiltin, false, 'LM Studio should not have builtin tools');
});

test('getEnabledToolDefinitions respects master toggle', () => {
  globalThis.window.config.enableFunctionCalling = false;

  const tools = getEnabledToolDefinitions('openai');
  assert.equal(tools.length, 0, 'should return no tools when master toggle is off');

  globalThis.window.config.enableFunctionCalling = true;
});

test('getEnabledToolDefinitions excludes disabled tools', () => {
  // Disable weather tool
  setToolEnabled('function:open_meteo_forecast', false);

  const tools = getEnabledToolDefinitions('openai');
  const hasWeather = tools.some(tool =>
    tool.type === 'function' && tool.name === 'open_meteo_forecast'
  );

  assert.equal(hasWeather, false, 'should not include disabled tools');

  // Re-enable for other tests
  setToolEnabled('function:open_meteo_forecast', true);
});

test('getEnabledToolDefinitions handles xAI service specially', () => {
  setToolEnabled('builtin:web_search', true);

  const xaiTools = getEnabledToolDefinitions('xai');

  // xAI should get both web_search and x_search
  const hasWebSearch = xaiTools.some(tool => tool.type === 'web_search');
  const hasXSearch = xaiTools.some(tool => tool.type === 'x_search');

  assert.equal(hasWebSearch, true, 'xAI should have web_search');
  assert.equal(hasXSearch, true, 'xAI should have x_search');

  // xAI should not have MCP tools
  const hasMcp = xaiTools.some(tool => tool.type === 'mcp');
  assert.equal(hasMcp, false, 'xAI should not have MCP tools');
});

test('getEnabledToolDefinitions omits image tool for Codex models', () => {
  setToolEnabled('builtin:image_generation', true);

  const codexTools = getEnabledToolDefinitions('openai', 'gpt-5.1-codex');
  const hasImageForCodex = codexTools.some(tool => tool.type === 'image_generation');
  assert.equal(hasImageForCodex, false, 'Codex models should not include the image generation tool');

  const standardTools = getEnabledToolDefinitions('openai', 'gpt-5.1');
  const hasImageForStandard = standardTools.some(tool => tool.type === 'image_generation');
  assert.equal(hasImageForStandard, true, 'Non-Codex models should keep image generation enabled');
});

test('code interpreter container is omitted for xAI', () => {
  setToolEnabled('builtin:code_interpreter', true);

  const openaiTools = getEnabledToolDefinitions('openai', 'gpt-5.1');
  const openaiCodeTool = openaiTools.find(tool => tool.type === 'code_interpreter');
  assert.ok(openaiCodeTool, 'OpenAI should include code interpreter');
  assert.ok(openaiCodeTool.container, 'OpenAI code interpreter should include container metadata');

  const xaiTools = getEnabledToolDefinitions('xai', 'grok-4-fast');
  const xaiCodeTool = xaiTools.find(tool => tool.type === 'code_interpreter');
  assert.ok(xaiCodeTool, 'xAI should include code interpreter');
  assert.equal(xaiCodeTool.container, undefined, 'xAI code interpreter should omit container metadata');
});
