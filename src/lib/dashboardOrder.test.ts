import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The dashboard is a flex column. The visual order must be intentional even
// though its sections are kept in their original DOM groups for other tabs.
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');
const dashboard = '.app-shell[data-screen="dashboard"][data-fighter-created="true"] .content>';

function visualOrder(selector: string): number {
  const needle = dashboard + selector + ' {order:';
  const start = css.indexOf(needle);
  expect(start, 'Missing scoped dashboard placement for ' + selector).toBeGreaterThanOrEqual(0);
  const match = css.slice(start + needle.length).match(/^(\d+);\}/);
  expect(match, 'Missing numeric dashboard order for ' + selector).not.toBeNull();
  return Number(match![1]);
}

describe('forge dashboard card placement', () => {
  it('places 01 / ТВОЯ СТАЛЬ directly below ТВОЙ БОЕЦ before secondary panels', () => {
    expect([
      visualOrder('.dashboard-player'),
      visualOrder('.cards-grid'),
      visualOrder('#pulse-progress'),
      visualOrder('#forge-quick-deck'),
    ]).toEqual([0, 1, 2, 3]);
  });
});
