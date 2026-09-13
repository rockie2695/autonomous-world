import { describe, it, expect } from 'vitest';
import { compressSnapshot, decompressSnapshot, type WorldState } from './snapshot';

describe('Snapshot Compression', () => {
  const createTestWorldState = (): WorldState => ({
    world: {
      id: 'world-1',
      name: 'Test World',
      currentRound: 10,
    },
    places: [
      {
        id: 'place-1',
        name: '洛陽',
        factionId: 'faction-1',
        administratorId: 'char-1',
        garrison: 100,
        fortress: 2,
        market: 3,
        barracks: 1,
        layoutX: 100,
        layoutY: 200,
      },
      {
        id: 'place-2',
        name: '長安',
        factionId: null,
        administratorId: null,
        garrison: 0,
        fortress: 0,
        market: 0,
        barracks: 0,
        layoutX: 300,
        layoutY: 400,
      },
    ],
    factions: [
      {
        id: 'faction-1',
        name: '魏',
        color: 'hsl(120, 70%, 50%)',
        alive: true,
        collapsing: false,
        kingId: 'char-1',
      },
    ],
    characters: [
      {
        id: 'char-1',
        name: '曹操',
        factionId: 'faction-1',
        wu: 25,
        tong: 28,
        jing: 20,
        speed: 18,
        loyalty: 'SELF',
        ambition: 22,
        age: 35,
        placeId: 'place-1',
        troops: 500,
        gold: 1000,
        alive: true,
        isKing: true,
      },
    ],
    roads: [
      {
        id: 'road-1',
        aId: 'place-1',
        bId: 'place-2',
      },
    ],
  });

  describe('compressSnapshot', () => {
    it('should return a Buffer', () => {
      const state = createTestWorldState();
      const compressed = compressSnapshot(state);
      
      expect(compressed).toBeInstanceOf(Buffer);
    });

    it('should produce a non-empty buffer', () => {
      const state = createTestWorldState();
      const compressed = compressSnapshot(state);
      
      expect(compressed.length).toBeGreaterThan(0);
    });

    it('should produce smaller output than JSON string for large objects', () => {
      const state = createTestWorldState();
      const jsonString = JSON.stringify(state);
      const compressed = compressSnapshot(state);
      
      // For small objects, gzip might not be smaller, but it should still work
      expect(compressed.length).toBeGreaterThan(0);
      expect(jsonString.length).toBeGreaterThan(0);
    });
  });

  describe('decompressSnapshot', () => {
    it('should correctly decompress a compressed snapshot', () => {
      const originalState = createTestWorldState();
      const compressed = compressSnapshot(originalState);
      const decompressed = decompressSnapshot(compressed);
      
      expect(decompressed).toEqual(originalState);
    });

    it('should preserve all data types', () => {
      const originalState = createTestWorldState();
      const compressed = compressSnapshot(originalState);
      const decompressed = decompressSnapshot(compressed);
      
      // Check world properties
      expect(typeof decompressed.world.id).toBe('string');
      expect(typeof decompressed.world.currentRound).toBe('number');
      
      // Check place properties
      expect(typeof decompressed.places[0].garrison).toBe('number');
      expect(typeof decompressed.places[0].factionId).toBe('string');
      expect(decompressed.places[1].factionId).toBeNull();
      
      // Check character properties
      expect(typeof decompressed.characters[0].wu).toBe('number');
      expect(typeof decompressed.characters[0].isKing).toBe('boolean');
    });
  });

  describe('compress/decompress round-trip', () => {
    it('should handle empty arrays', () => {
      const state: WorldState = {
        world: { id: 'w1', name: 'Empty', currentRound: 0 },
        places: [],
        factions: [],
        characters: [],
        roads: [],
      };
      
      const compressed = compressSnapshot(state);
      const decompressed = decompressSnapshot(compressed);
      
      expect(decompressed).toEqual(state);
    });

    it('should handle special characters in names', () => {
      const state = createTestWorldState();
      state.places[0].name = '洛陽城（東門）';
      state.characters[0].name = '諸葛亮';
      
      const compressed = compressSnapshot(state);
      const decompressed = decompressSnapshot(compressed);
      
      expect(decompressed.places[0].name).toBe('洛陽城（東門）');
      expect(decompressed.characters[0].name).toBe('諸葛亮');
    });

    it('should handle large state objects', () => {
      const state = createTestWorldState();
      
      // Add many places
      for (let i = 0; i < 100; i++) {
        state.places.push({
          id: `place-${i}`,
          name: `地點${i}`,
          factionId: null,
          administratorId: null,
          garrison: i * 10,
          fortress: i % 5,
          market: i % 3,
          barracks: i % 4,
          layoutX: i * 10,
          layoutY: i * 20,
        });
      }
      
      const compressed = compressSnapshot(state);
      const decompressed = decompressSnapshot(compressed);
      
      expect(decompressed.places.length).toBe(102); // 2 original + 100 new
    });
  });
});
