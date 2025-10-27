import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const {
  collectImageCandidates,
  ensureImagesHaveMessageIds,
} = await import('../src/js/services/streaming/imageGeneration.js');

test('collectImageCandidates gathers nested data URLs and deduplicates', () => {
  const payload = {
    result: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mP8z/D/PwMDAwMABbgC+xK76i8AAAAASUVORK5CYII=',
    nested: [
      {
        image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4QBuRXhpZgAATU0AKgAAAAgABAE7AAIAAAAGAAAISodpAAQAAAABAAAALgAAAAAAAqACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAwEBPwE//8QAFBEBAAAAAAAAAAAAAAAAAAAAIP/aAAgBAgEBPwE//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=',
      },
      [
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mNk+M+ABAwMDAwABXEC+Yo0NmsAAAAASUVORK5CYII=',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR42mNk+M+ABAwMDAwABXEC+Yo0NmsAAAAASUVORK5CYII=',
      ],
    ],
  };

  const accumulator = [];
  const seen = new Set();
  const visited = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  collectImageCandidates(payload, accumulator, 'image/png', seen, visited);

  assert.equal(accumulator.length, 3);
  const mimeTypes = accumulator.map(item => item.mimeType);
  assert.ok(mimeTypes.includes('image/png'));
  assert.ok(mimeTypes.includes('image/jpeg'));

  // Ensure duplicates were removed
  const uniqueData = new Set(accumulator.map(item => item.dataUrl));
  assert.equal(uniqueData.size, accumulator.length);
});

test('ensureImagesHaveMessageIds matches placeholders and timestamps', () => {
  const now = new Date().toISOString();

  window.conversationHistory = [
    {
      id: 'assistant-1',
      role: 'assistant',
      timestamp: now,
      content: 'Here is an image [[IMAGE: latest.png]] for you.',
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      timestamp: new Date(Date.now() - 1000).toISOString(),
      content: 'Earlier message without placeholder.',
    },
  ];

  window.generatedImages = [
    { filename: 'latest.png', timestamp: now },
    { filename: 'orphan.png', timestamp: new Date(Date.now() - 1000).toISOString() },
  ];

  const updated = ensureImagesHaveMessageIds();

  assert.equal(updated, 2);
  const byFilename = Object.fromEntries(window.generatedImages.map(img => [img.filename, img.associatedMessageId]));

  assert.equal(byFilename['latest.png'], 'assistant-1');
  assert.equal(byFilename['orphan.png'], 'assistant-2'); // falls back to closest assistant message by timestamp
  assert.ok(window.conversationHistory[0].hasImages);
});
