import { describe, it, expect } from 'vitest';
import { setPin, unsetPin, cleanOrphanPins } from './pins';
import type { PinsMap } from '../../types';

describe('setPin', () => {
  it('adds a pin', () => {
    const next = setPin({}, 'n1', 10, 20);
    expect(next.n1).toEqual({ x: 10, y: 20 });
  });

  it('overwrites existing pin', () => {
    const next = setPin({ n1: { x: 0, y: 0 } }, 'n1', 5, 5);
    expect(next.n1).toEqual({ x: 5, y: 5 });
  });
});

describe('unsetPin', () => {
  it('removes existing pin', () => {
    const next = unsetPin({ n1: { x: 0, y: 0 } }, 'n1');
    expect(next.n1).toBeUndefined();
  });

  it('no-op on missing id', () => {
    const start: PinsMap = { n1: { x: 0, y: 0 } };
    const next = unsetPin(start, 'nX');
    expect(next).toEqual(start);
  });
});

describe('cleanOrphanPins', () => {
  it('drops pins whose id is not in validNodeIds', () => {
    const start: PinsMap = { n1: { x: 0, y: 0 }, n2: { x: 1, y: 1 } };
    const next = cleanOrphanPins(start, new Set(['n1']));
    expect(next).toEqual({ n1: { x: 0, y: 0 } });
  });
});
