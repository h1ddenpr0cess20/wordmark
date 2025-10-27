import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;
const originalWindow = global.window;

function setupWindow() {
  global.window = {
    config: {
      getApiKey: () => 'test-key',
      getBaseUrl: () => 'https://api.example.com',
    },
    serviceSelector: { value: 'openai' },
  };
}

test('listAssistantFiles returns data on success', async () => {
  setupWindow();
  const { listAssistantFiles } = await import('../src/js/services/files.js');

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ data: [{ id: 'file-1' }] }),
    };
  };

  try {
    const result = await listAssistantFiles();
    assert.equal(result.data.length, 1);
    assert.equal(calls[0].url, 'https://api.example.com/files?purpose=assistants');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
  } finally {
    global.fetch = originalFetch;
  }
});

test('listAssistantFiles throws when request fails', async () => {
  setupWindow();
  const { listAssistantFiles } = await import('../src/js/services/files.js');

  global.fetch = async () => ({
    ok: false,
    text: async () => 'nope',
  });

  try {
    await assert.rejects(
      () => listAssistantFiles(),
      /Failed to list assistant files: nope/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('deleteFile sends delete request and returns payload', async () => {
  setupWindow();
  const { deleteFile } = await import('../src/js/services/files.js');

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    assert.equal(options.method, 'DELETE');
    return {
      ok: true,
      json: async () => ({ id: 'file-123', deleted: true }),
    };
  };

  try {
    const result = await deleteFile('file-123');
    assert.equal(result.id, 'file-123');
    assert.equal(calls[0].url, 'https://api.example.com/files/file-123');
  } finally {
    global.fetch = originalFetch;
  }
});

test('deleteAllAssistantFiles aggregates successes and errors', async () => {
  setupWindow();
  const { deleteAllAssistantFiles } = await import('../src/js/services/files.js');

  const responses = [
    {
      ok: true,
      json: async () => ({ data: [{ id: 'f-1' }, { id: 'f-2' }] }),
    },
    {
      ok: true,
      json: async () => ({ id: 'f-1', deleted: true }),
    },
    {
      ok: false,
      text: async () => 'problem',
    },
  ];

  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const next = responses.shift();
    if (!next) {
      throw new Error('Unexpected fetch call');
    }
    return next;
  };

  try {
    const result = await deleteAllAssistantFiles();
    assert.equal(result.deleted, 1);
    assert.equal(result.total, 2);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].error, /Failed to delete file f-2: problem/);

    assert.equal(requests[0].options.method, 'GET');
    assert.equal(requests[1].options.method, 'DELETE');
    assert.equal(requests[2].options.method, 'DELETE');
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
});
