import { describe, expect, it } from 'vitest';
import { SquatCounter, StableKneeTracker, type PosePoint } from './squatCounter';

const cycle = [170,170,170,140,123,98,91,89,90,90,118,142,167,173,175,176];
function feed(counter: SquatCounter, angles: readonly number[], start = 0, step = 75) {
  let result = counter.update(angles[0], start, 'left');
  for (let i=1; i<angles.length; i++) result=counter.update(angles[i],start+i*step,'left');
  return result;
}

describe('BF-203 negative observation replay', () => {
  it('does not advance the state on repeated, backwards or invalid timestamps', () => {
    const c=new SquatCounter();
    expect(feed(c,[170,170,170]).phase).toBe('ready');
    for (const now of [150,149,NaN,Infinity,-Infinity,-1]) {
      const s=c.update(90,now,'left');
      expect(s.phase).toBe('ready');
      expect(s.counted).toBe(false);
      expect(s.count).toBe(0);
    }
    expect(feed(c,cycle,225).count).toBe(1);
  });

  it('requires fresh visible standing observations after a missing calibration frame', () => {
    const c=new SquatCounter();
    c.update(170,0,'left');
    c.update(null,100,null);
    expect(c.update(170,200,'left').phase).toBe('calibrate');
    expect(c.update(170,350,'left').phase).toBe('ready');
  });

  it('does not use a missed observation to satisfy the return hold', () => {
    const c=new SquatCounter();
    expect(feed(c,cycle.slice(0,14)).phase).toBe('bottom');
    expect(c.update(null,1050,null).count).toBe(0);
    const resumed=c.update(176,1125,'left');
    expect(resumed.count).toBe(0);
    expect(resumed.counted).toBe(false);
    expect(c.update(176,1225,'left').count).toBe(1);
  });

  it.each([false,true])('discards an unobserved partial cycle after a 600ms gap (explicit missing frames=%s)', explicit => {
    const c=new SquatCounter();
    expect(feed(c,cycle.slice(0,10)).phase).toBe('bottom');
    if (explicit) for (const t of [775,875,975,1075,1175]) c.update(null,t,null);
    const resumed=c.update(175,1275,'left');
    expect(resumed.phase).toBe('calibrate');
    expect(feed(c,[175,175,175],1375,100).count).toBe(0);
    expect(feed(c,cycle,1700).count).toBe(1);
  });

  it('preserves one paid repetition while rejecting a hidden second descent or return', () => {
    const c=new SquatCounter();
    expect(feed(c,cycle).count).toBe(1);
    expect(feed(c,cycle.slice(0,10),1250).phase).toBe('bottom');
    c.update(null,2100,null);
    expect(c.update(175,2525,'left').phase).toBe('calibrate');
    expect(feed(c,[175,175,175],2625,100).count).toBe(1);
    expect(feed(c,cycle,3000).count).toBe(2);
  });

  it('keeps a briefly obscured cycle on the same leg without awarding it twice', () => {
    const c=new SquatCounter();
    expect(feed(c,cycle.slice(0,10)).phase).toBe('bottom');
    expect(c.update(null,750,null).phase).toBe('bottom');
    expect(feed(c,cycle.slice(10),825).count).toBe(1);
    expect(feed(c,[175,175,175],1350).count).toBe(1);
  });

  it('only a new workout resets the monotonic observation clock', () => {
    const c=new SquatCounter();
    expect(feed(c,cycle).count).toBe(1);
    c.recalibrate();
    expect(feed(c,[170,170,170],0,100).phase).toBe('calibrate');
    expect(feed(c,[170,170,170],1300,100).phase).toBe('ready');
    c.reset();
    expect(feed(c,[170,170,170],0,100).phase).toBe('ready');
    expect(c.update(170,300).count).toBe(0);
  });

  it('does not admit out-of-range confidence on an otherwise visible leg', () => {
    const points:PosePoint[]=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));
    points[23]={x:.5,y:.3,visibility:1.01,presence:.98};
    points[25]={x:.5,y:.5,visibility:.98,presence:.98};
    points[27]={x:.5,y:.7,visibility:.98,presence:.98};
    expect(new StableKneeTracker().update(points)).toEqual({angle:null,side:null});
  });
});
