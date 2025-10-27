import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createHistoryModule({ windowOverrides = {}, globals = {} } = {}) {
  const modulePath = path.resolve('src/js/services/history/persistence.js');
  return loadWindowScript(modulePath, {
    window: { ...windowOverrides },
    globals,
  });
}

test('saveCurrentConversation filters metadata, persists images, and marks messages', async () => {
  const savedConversations = [];
  const savedImages = [];

  const windowObj = createHistoryModule({
    windowOverrides: {
      conversationHistory: [
        { id: 'm-user', role: 'user', content: 'Hello' },
        { id: 'm-assistant', role: 'assistant', content: 'Hi there!' },
        { id: 'm-dev', role: 'developer', content: 'skip me' },
      ],
      generatedImages: [
        {
          url: 'data:image/png;base64,AAA',
          prompt: 'sunset',
          associatedMessageId: 'm-assistant',
        },
        {
          url: 'https://example.com/already.png',
          filename: 'already.png',
          associatedMessageId: 'other',
        },
      ],
      currentConversationId: 'existing-id',
      currentConversationName: 'Existing Name',
      ensureImagesHaveMessageIds() {
        return 0;
      },
      saveImageToDb(dataUrl, filename, meta) {
        savedImages.push({ dataUrl, filename, meta });
        return Promise.resolve(`stored-${filename}`);
      },
      saveConversationToDb(conversation) {
        savedConversations.push(conversation);
        return Promise.resolve(conversation.id);
      },
      modelSelector: { value: 'gpt-4o' },
      config: { defaultService: 'openai' },
      personalityPromptRadio: { checked: true },
      personalityInput: { value: 'Be cheerful' },
      customPromptRadio: { checked: false },
      systemPromptCustom: { value: '' },
    },
  });

  windowObj.saveCurrentConversation({ name: 'Manual Title' });
  await Promise.resolve();

  assert.equal(savedImages.length, 1);
  assert.ok(savedImages[0].filename.endsWith('.png'));
  assert.equal(savedImages[0].meta.prompt, 'sunset');

  assert.equal(savedConversations.length, 1);
  const convo = savedConversations[0];
  assert.equal(convo.id, 'existing-id');
  assert.equal(convo.name, 'Manual Title');
  assert.equal(convo.model, 'gpt-4o');
  assert.equal(convo.service, 'openai');
  assert.equal(convo.systemPrompt.type, 'personality');
  assert.equal(convo.systemPrompt.content, 'Be cheerful');

  assert.equal(convo.messages.length, 2);
  const assistantMsg = convo.messages.find(msg => msg.role === 'assistant');
  assert.equal(assistantMsg.hasImages, true);

  assert.equal(convo.images.length, 2);
  const storedImage = convo.images.find(img => img.isStoredInDb);
  assert.equal(storedImage.associatedMessageId, 'm-assistant');
  assert.equal(windowObj.currentConversationName, 'Manual Title');
});

test('loadConversation hydrates UI, preloads images, and filters developer messages', async () => {
  const loadedImages = [];
  const renderCalls = [];
  let highlightLoaded = false;
  let markedLoaded = false;

  const conversationRecord = {
    id: '1',
    name: 'Previous chat',
    systemPrompt: { type: 'custom', content: 'Keep it short' },
    messages: [
      { id: 'a', role: 'assistant', content: 'Hi human' },
      { id: 'd', role: 'developer', content: 'internal note' },
    ],
    images: [
      { filename: 'stored.png', isStoredInDb: true, associatedMessageId: 'a' },
      { filename: 'remote.jpg', isStoredInDb: false },
    ],
  };

  const windowObj = createHistoryModule({
    windowOverrides: {
      loadConversationFromDb: async (id) => (id === '1' ? conversationRecord : null),
      loadImageFromDb: async (filename) => {
        loadedImages.push(filename);
        return { data: `binary:${filename}` };
      },
      renderConversationMessages: (convo, cache) => {
        renderCalls.push({ convo, cache });
      },
      loadHighlightJS: async () => {
        highlightLoaded = true;
      },
      loadMarkedLibrary: async () => {
        markedLoaded = true;
      },
      chatBox: { innerHTML: 'old' },
    },
    globals: {
      hljs: undefined,
      marked: undefined,
    },
  });

  const result = await windowObj.loadConversation('1');
  assert.equal(result, true);
  assert.equal(highlightLoaded, true);
  assert.equal(markedLoaded, true);
  assert.deepEqual(loadedImages, ['stored.png']);
  assert.equal(windowObj.chatBox.innerHTML, '');

  assert.equal(renderCalls.length, 1);
  const { convo, cache } = renderCalls[0];
  assert.equal(convo, conversationRecord);
  assert.equal(cache.get('stored.png'), 'binary:stored.png');

  assert.equal(windowObj.conversationHistory.length, 1);
  assert.equal(windowObj.conversationHistory[0].role, 'assistant');
  assert.equal(windowObj.generatedImages.length, 2);
  assert.equal(windowObj.currentConversationId, '1');
});

test('startNewConversation saves existing session and resets state', () => {
  let saveCalls = 0;

  const windowObj = createHistoryModule({
    windowOverrides: {
      chatBox: { innerHTML: '<p>old</p>' },
    },
  });

  windowObj.conversationHistory = [{ role: 'user', content: 'hello' }];
  windowObj.currentConversationId = 'existing';
  windowObj.currentConversationName = 'Existing';
  windowObj.saveCurrentConversation = () => {
    saveCalls += 1;
  };

  windowObj.startNewConversation('Fresh Chat');
  assert.equal(saveCalls, 1);
  assert.equal(windowObj.conversationHistory.length, 0);
  assert.equal(windowObj.currentConversationId, null);
  assert.equal(windowObj.currentConversationName, 'Fresh Chat');
  assert.equal(windowObj.chatBox.innerHTML, '');
});
