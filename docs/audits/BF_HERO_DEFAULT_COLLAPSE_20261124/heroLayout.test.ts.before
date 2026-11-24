import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Stable structural guard; a real mobile browser verifies positions and toggling.
const source = readFileSync(new URL('../components/ForgeWorld.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');
const studio = source.split('export function ForgeStudio(')[1]?.split('interface TowerProps')[0] ?? '';

describe('Hero screen composition', () => {
  it('places all four muscle upgrades directly under the 3D fighter, before cosmetic panels', () => {
    expect(studio).toContain('className="studio-hero-column"');
    const preview = studio.indexOf('className="studio-preview"');
    const muscle = studio.indexOf('className="muscle-grid"');
    const options = studio.indexOf('className="studio-content"');
    expect(preview).toBeGreaterThan(0);
    expect(muscle).toBeGreaterThan(preview);
    expect(options).toBeGreaterThan(muscle);
    expect(studio).toContain('MUSCLES.map((muscle)');
    expect(css).toContain('#forge .studio-hero-column');
  });

  it('makes Avatar Lab and wardrobe independently accessible native disclosures', () => {
    expect(studio).toContain('data-studio-panel="appearance"');
    expect(studio).toContain('data-studio-panel="wardrobe"');
    expect(studio.match(/<details className="studio-accordion"/g)).toHaveLength(2);
    expect(studio.match(/<summary className="studio-accordion-trigger"/g)).toHaveLength(2);
    expect(studio).toContain('СОБЕРИ');
    expect(studio).toContain('ГАРДЕРОБ');
    expect(studio).toContain('<AvatarLab look={look}');
    expect(studio).toContain('OUTFITS.map((outfit)');
    expect(css).toContain('#forge .studio-accordion > .studio-accordion-trigger:focus-visible');
  });
});
