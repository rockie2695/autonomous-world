import { describe, it, expect } from 'vitest';
import { captureLeaderOf } from './capture';

describe('captureLeaderOf', () => {
  const chars = [
    { id: 'slow', factionId: 'f1', speed: 10, troops: 5 },
    { id: 'fast', factionId: 'f1', speed: 24, troops: 1 },
    { id: 'faster-but-0troops', factionId: 'f2', speed: 30, troops: 0 },
    { id: 'factionless', factionId: null, speed: 28, troops: 9 },
  ];

  it('the fastest troop-bearing factioned leader takes the place', () => {
    expect(captureLeaderOf(chars)?.id).toBe('fast');
  });

  it('a 0-troop leader never captures, however fast', () => {
    const only = [
      { id: 'starved', factionId: 'f1', speed: 30, troops: 0 },
    ];
    expect(captureLeaderOf(only)).toBeNull();
  });

  it('a factionless leader never captures', () => {
    const only = [{ id: 'loner', factionId: null, speed: 30, troops: 9 }];
    expect(captureLeaderOf(only)).toBeNull();
  });

  it('nobody standing there means no capture', () => {
    expect(captureLeaderOf([])).toBeNull();
  });

  it('narrows the faction id to a string on the winner', () => {
    const leader = captureLeaderOf(chars);
    if (!leader) throw new Error('expected a leader');
    const faction: string = leader.factionId;
    expect(faction).toBe('f1');
  });
});
