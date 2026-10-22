import { describe, it, expect } from 'vitest';
import { buildLibelle, formatNumero } from '../scanEcritures';

describe('libelle des ecritures ScanFlash', () => {
  it('garde le numero brut sans doubler le prefixe FAC', () => {
    expect(buildLibelle('FAC2606-00001989', 'Client SARL')).toBe('FAC2606-00001989/Client SARL');
  });

  it('gere aussi les avoirs (prefixe AVR deja present)', () => {
    expect(buildLibelle('AVR2606-00000012', 'Client SARL')).toBe('AVR2606-00000012/Client SARL');
  });

  it('ne touche pas aux numeros sans prefixe (saisie manuelle)', () => {
    expect(buildLibelle('123', 'Client SARL')).toBe('123/Client SARL');
  });

  it('retombe sur le numero si le client manque', () => {
    expect(buildLibelle('FAC2606-00001989', '')).toBe('FAC2606-00001989');
    expect(buildLibelle('FAC2606-00001989', '   ')).toBe('FAC2606-00001989');
  });

  it('retombe sur le client si le numero manque', () => {
    expect(buildLibelle('', 'Client SARL')).toBe('Client SARL');
    expect(buildLibelle(null, 'Client SARL')).toBe('Client SARL');
  });

  it('renvoie une chaine vide quand tout manque', () => {
    expect(buildLibelle('', '')).toBe('');
    expect(buildLibelle(undefined, undefined)).toBe('');
  });

  it('nettoie les espaces autour du numero et du client', () => {
    expect(buildLibelle('  FAC2606-00001989  ', '  Client SARL  ')).toBe('FAC2606-00001989/Client SARL');
  });
});

describe('numero affiche dans la liste des factures', () => {
  it('ne double pas le prefixe FAC deja present', () => {
    expect(formatNumero('FAC2609-00002391', false)).toBe('FAC2609-00002391');
  });

  it('ne double pas le prefixe AVR deja present', () => {
    expect(formatNumero('AVR2609-00000012', true)).toBe('AVR2609-00000012');
  });

  it('ajoute le prefixe aux numeros nus', () => {
    expect(formatNumero('123', false)).toBe('FAC 123');
    expect(formatNumero('45', true)).toBe('AVR 45');
  });

  it('gere un numero vide', () => {
    expect(formatNumero('', false)).toBe('FAC');
    expect(formatNumero(null, true)).toBe('AVR');
  });
})