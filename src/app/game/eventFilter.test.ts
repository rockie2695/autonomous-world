import { describe, it, expect } from 'vitest';
import { eventLeaderIds, eventPlaceIds } from './eventFilter';

describe('eventLeaderIds', () => {
  it('collects every leader-id field an event carries', () => {
    // 母子兩人都在一列上 / a child-birth row names both mother-side and father
    expect(eventLeaderIds({ charId: 'a', fatherId: 'b' })).toEqual(['a', 'b']);
    // 收益列的兩個收款人 / an income row's two recipients
    expect(eventLeaderIds({ kingId: 'k', adminId: 'd' })).toEqual(['k', 'd']);
    // 免職列的舊任與接任者 / a removal row's outgoing admin and successor
    expect(eventLeaderIds({ charId: 'a', newAdminId: 'n', friendId: 'f' })).toEqual([
      'a',
      'f',
      'n',
    ]);
  });

  it('ignores empty and non-string values', () => {
    expect(eventLeaderIds({ charId: '', fatherId: 42, friendId: null })).toEqual([]);
    expect(eventLeaderIds({})).toEqual([]);
  });
});

describe('eventPlaceIds', () => {
  it('a move row mentions both endpoints', () => {
    expect(eventPlaceIds({ fromPlaceId: 'a', toPlaceId: 'b' })).toEqual(['a', 'b']);
  });

  it('ignores empty and non-string values', () => {
    expect(eventPlaceIds({ placeId: '' })).toEqual([]);
    expect(eventPlaceIds({})).toEqual([]);
  });
});
