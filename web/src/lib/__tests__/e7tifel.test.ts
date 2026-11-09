import { describe, it, expect, vi, afterEach } from 'vitest';
import { e7tifelDecision, e7tifelPickIndex, E7TIFEL_VIDEOS } from '../e7tifel';

describe('e7tifelDecision : fin de tâche vs norme', () => {
  it('dans les temps (temps < norme) → vidéo', () => {
    expect(e7tifelDecision(600, 599)).toBe('video');
    expect(e7tifelDecision(600, 0)).toBe('video');
  });

  it('exactement à la norme → vidéo (inclus)', () => {
    expect(e7tifelDecision(600, 600)).toBe('video');
  });

  it('après la norme → motif obligatoire', () => {
    expect(e7tifelDecision(600, 601)).toBe('motif');
    expect(e7tifelDecision(60, 3600)).toBe('motif');
  });

  it('sans norme → rien (ni vidéo ni motif)', () => {
    expect(e7tifelDecision(null, 9999)).toBeNull();
    expect(e7tifelDecision(undefined, 0)).toBeNull();
    expect(e7tifelDecision(0, 100)).toBeNull();
    expect(e7tifelDecision(-5, 100)).toBeNull();
  });

  it('temps invalide → rien', () => {
    expect(e7tifelDecision(600, NaN)).toBeNull();
    expect(e7tifelDecision(600, -1)).toBeNull();
  });
});

describe('e7tifelPickIndex : une seule vidéo au hasard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reste dans [1, N]', () => {
    for (let i = 0; i < 500; i++) {
      const n = e7tifelPickIndex();
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(E7TIFEL_VIDEOS);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('peut sortir chaque index (hasard réparti)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) seen.add(e7tifelPickIndex(6));
    expect(seen.size).toBe(6);
  });

  it('utilise Math.random donc reste déterministe si mocké', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(e7tifelPickIndex()).toBe(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(e7tifelPickIndex()).toBe(E7TIFEL_VIDEOS);
  });
});
