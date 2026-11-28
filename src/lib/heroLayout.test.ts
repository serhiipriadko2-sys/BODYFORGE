import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Stable structural guard; a real mobile browser verifies positions and toggling.
const source = readFileSync(new URL('../components/ForgeWorld.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../neonPulseV2.css', import.meta.url), 'utf8');
const zonePanel = readFileSync(new URL('../components/MuscleZonePanel.tsx', import.meta.url), 'utf8');
const studio = source.split('export function ForgeStudio(')[1]?.split('interface TowerProps')[0] ?? '';

describe('Hero screen composition', () => {
  it('keeps approved regional or legacy muscle upgrades directly after the 3D fighter, before cosmetic controls', () => {
    expect(studio).toContain('className="studio-hero-column"');
    const preview = studio.indexOf('className="studio-preview"');
    const muscle = studio.indexOf('className="muscle-grid"');
    const options = studio.indexOf('className="studio-content"');
    expect(preview).toBeGreaterThan(0);
    expect(muscle).toBeGreaterThan(preview);
    expect(options).toBeGreaterThan(muscle);
    expect(studio).toContain('MUSCLES.map((muscle)');
    const regional = studio.indexOf('{regional ? <MuscleZonePanel');
    const shirt = studio.indexOf('data-shirt=');
    const motion = studio.indexOf('data-avatar-motion');
    expect(regional).toBeGreaterThan(preview);
    expect(regional).toBeLessThan(muscle);
    expect(studio).toContain('onUpgrade={onZoneUpgrade} onView={viewZone}');
    expect(studio.match(/data-shirt=/g)).toHaveLength(1);
    expect(shirt).toBeGreaterThan(muscle);
    expect(motion).toBeGreaterThan(shirt);
    expect(options).toBeGreaterThan(motion);
    expect(studio).toContain('shirt: look.shirt !== true');
    expect(css).toContain('#forge .studio-hero-column');
  });

  it('keeps independently selectable groups and per-zone upgrade controls', () => {
    expect(zonePanel).toContain('data-regional-muscles');
    expect(zonePanel).toContain('ZONE_GROUPS.map(g=>');
    expect(zonePanel).toContain('data-zone-group={g.id}');
    expect(zonePanel).toContain('aria-pressed={selected===g.id}');
    expect(zonePanel).toContain('group.zones.map(z=>');
    expect(zonePanel).toContain('data-zone-view={z.id}');
    expect(zonePanel).toContain('data-zone-upgrade={z.id}');
    expect(zonePanel).toContain('onUpgrade(z.id)');
    expect(zonePanel).toContain('disabled={!ready||busy||!created||capped||!enough}');
    expect(zonePanel).toContain('aria-valuemax={ZONE_POINT_MAX}');
  });

  it('makes Avatar Lab and wardrobe independently accessible native disclosures', () => {
    expect(studio).toContain('data-studio-panel="appearance"');
    expect(studio).toContain('data-studio-panel="wardrobe"');
    expect(studio).toContain('<details className="studio-accordion" data-studio-panel="appearance">');
    expect(studio).toContain('<details className="studio-accordion" data-studio-panel="wardrobe">');
    expect(studio.match(/<details className="studio-accordion"/g)).toHaveLength(2);
    expect(studio.match(/<summary className="studio-accordion-trigger"/g)).toHaveLength(2);
    expect(studio).toContain('СОБЕРИ');
    expect(studio).toContain('ГАРДЕРОБ');
    expect(studio).toContain('<AvatarLab look={look}');
    expect(studio).toContain('OUTFITS.map((outfit)');
    expect(css).toContain('#forge .studio-accordion > .studio-accordion-trigger:focus-visible');
  });
});
