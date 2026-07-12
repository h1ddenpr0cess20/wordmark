import test from 'node:test';
import assert from 'node:assert/strict';

const { computeTooltipPlacement } = await import('../src/ts/utils/tooltipPosition.js');

type Input = Parameters<typeof computeTooltipPlacement>[0];

const baseInput = (overrides: Partial<Input> = {}): Input => ({
  elementRect: { top: 300, bottom: 320, left: 400, right: 440, width: 40, height: 20 },
  tooltipRect: { width: 100, height: 30 },
  viewportWidth: 1000,
  viewportHeight: 800,
  scrollX: 0,
  scrollY: 0,
  isHelpIcon: false,
  ...overrides,
});

test('default tooltip is centered above the anchor with no arrow offset', () => {
  const { left, top, arrowOffset } = computeTooltipPlacement(baseInput());
  assert.equal(left, 370);
  assert.equal(top, 260);
  assert.equal(arrowOffset, null);
});

test('flips below the anchor when there is not enough room above', () => {
  const { top } = computeTooltipPlacement(baseInput({
    elementRect: { top: 5, bottom: 25, left: 400, right: 440, width: 40, height: 20 },
  }));
  assert.equal(top, 35);
});

test('clamps to the left viewport edge', () => {
  const { left } = computeTooltipPlacement(baseInput({
    elementRect: { top: 300, bottom: 320, left: 200, right: 260, width: 60, height: 20 },
    tooltipRect: { width: 600, height: 30 },
  }));
  assert.equal(left, 10);
});

test('help icon is placed below-left and derives an arrow offset when edge-clamped', () => {
  const { top, left, arrowOffset } = computeTooltipPlacement(baseInput({
    isHelpIcon: true,
    elementRect: { top: 300, bottom: 320, left: 5, right: 25, width: 20, height: 20 },
    tooltipRect: { width: 200, height: 30 },
  }));
  assert.equal(top, 325);
  assert.equal(left, 10);
  assert.equal(arrowOffset, 10);
});

test('clamps vertically to the bottom viewport edge', () => {
  const { top } = computeTooltipPlacement(baseInput({
    isHelpIcon: true,
    elementRect: { top: 790, bottom: 810, left: 400, right: 440, width: 40, height: 20 },
    viewportHeight: 800,
  }));
  assert.equal(top, 760);
});
