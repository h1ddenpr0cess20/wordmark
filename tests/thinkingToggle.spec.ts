import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {} as Window & typeof globalThis;

interface FakeContent {
  scrollTop: number;
  scrollHeight: number;
}

interface FakeContainer {
  id: string;
  dataset: Record<string, string>;
  classList: {
    contains(name: string): boolean;
    add(name: string): void;
    remove(name: string): void;
    toggle(name: string): void;
  };
  querySelector(selector: string): FakeContent | null;
}

let container: FakeContainer;
let content: FakeContent;

function makeContainer(collapsed: boolean, scrollHeight = 1000): void {
  const classes = new Set<string>(collapsed ? ['collapsed'] : []);
  content = { scrollTop: 0, scrollHeight };
  container = {
    id: 'thinking-1',
    dataset: {},
    classList: {
      contains: (name: string) => classes.has(name),
      add: (name: string) => { classes.add(name); },
      remove: (name: string) => { classes.delete(name); },
      toggle: (name: string) => {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
    },
    querySelector: () => content,
  };
}

globalThis.document = {
  getElementById: () => container as unknown as HTMLElement,
  addEventListener: () => {},
} as unknown as Document;

const { state } = await import('../src/ts/init/state.js');
const { toggleThinking } = await import('../src/ts/utils/thinking.js');

test('collapsing remembers where the reader was, and expanding returns there', () => {
  makeContainer(false);
  content.scrollTop = 420;

  toggleThinking('thinking-1');
  assert.equal(container.dataset.scrollTop, '420', 'position is saved before the panel is hidden');

  // Hiding the panel zeroes the browser's scroll position.
  content.scrollTop = 0;

  toggleThinking('thinking-1');
  assert.equal(content.scrollTop, 420, 'reopening returns to the saved position');
});

test('a first expand on a settled turn opens at the top', () => {
  makeContainer(true);
  state.isResponsePending = false;

  toggleThinking('thinking-1');

  assert.equal(content.scrollTop, 0);
});

test('a first expand mid-turn opens on the newest reasoning', () => {
  makeContainer(true, 1000);
  state.isResponsePending = true;

  toggleThinking('thinking-1');

  assert.equal(content.scrollTop, 1000, 'follows the stream instead of sitting at old text');
  state.isResponsePending = false;
});

test('expanding does not schedule a later jump', async () => {
  makeContainer(true);
  state.isResponsePending = false;

  toggleThinking('thinking-1');
  content.scrollTop = 300;

  await new Promise(resolve => setTimeout(resolve, 150));

  assert.equal(content.scrollTop, 300, 'a scroll made after expanding survives');
});
