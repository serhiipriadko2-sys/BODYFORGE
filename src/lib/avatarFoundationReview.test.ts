import { describe, expect, it } from 'vitest';
import { FOUNDATION_GROUPS, foundationWeights } from './avatarFoundationReview';

describe('foundation geometry progression', () => {
  it('keeps eight independent volume and relief weights across all 1296 profiles', () => {
    for (let arms=0;arms<=5;arms++) for(let core=0;core<=5;core++)
      for(let legs=0;legs<=5;legs++) for(let back=0;back<=5;back++) {
        const levels={arms,core,legs,back}, w=foundationWeights(levels);
        expect(Object.keys(w)).toHaveLength(8);
        for (const g of FOUNDATION_GROUPS) {
          const v=g.toUpperCase()+'_VOLUME', r=g.toUpperCase()+'_RELIEF';
          expect(w[v]).toBe(levels[g]/5);
          expect(w[r]).toBeGreaterThanOrEqual(0);
          expect(w[r]).toBeLessThanOrEqual(1);
          expect(foundationWeights(levels,false)[r]).toBe(0);
          if(levels[g]<5) {
            const next=foundationWeights({...levels,[g]:levels[g]+1});
            expect(next[v]).toBeGreaterThan(w[v]);expect(next[r]).toBeGreaterThan(w[r]);
            for(const other of Object.keys(w).filter(k=>k!==v&&k!==r)) expect(next[other]).toBe(w[other]);
          }
        }
      }
  });
  it('clamps malformed levels, preserves zero and all-max, and does not mutate levels',()=>{
    expect(Object.values(foundationWeights({}))).toEqual(Array(8).fill(0));
    const max={arms:5,core:5,legs:5,back:5} as const;
    expect(Object.values(foundationWeights(max))).toEqual(Array(8).fill(1));
    expect(foundationWeights({arms:NaN,core:-1,legs:99,back:Infinity})).toEqual(foundationWeights({legs:5}));
    expect(max).toEqual({arms:5,core:5,legs:5,back:5});
  });
});
