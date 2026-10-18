// Duree de vie du jeton du cabinet : « une fois connecte, on reste connecte ».
//
// Elle etait de 24 h : l'utilisateur devait retaper email + mot de passe chaque
// jour, et un jeton perime le renvoyait a l'ecran de connexion sans prevenir.
// Le cabinet est deja protege a chaque ouverture par le code d'acces cote web,
// donc le jeton vit un an. Ce test verrouille les deux moities de la regle : la
// duree choisie, et le fait que le controle d'expiration reste en place (une
// duree longue ne doit pas transformer un jeton perime en jeton valable).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORG_TOKEN_TTL_MS } from '../src/index.ts';

const SRC = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('le jeton vit un an, pas 24 h', () => {
  assert.equal(ORG_TOKEN_TTL_MS, 365 * 24 * 60 * 60 * 1000);
  assert.ok(ORG_TOKEN_TTL_MS >= 300 * 24 * 60 * 60 * 1000, 'au moins 300 jours');
});

test('la connexion signe le jeton avec cette duree', () => {
  assert.match(SRC, /exp: Date\.now\(\) \+ ORG_TOKEN_TTL_MS/);
  assert.ok(!/exp: Date\.now\(\) \+ 86400000/.test(SRC), 'plus de duree de 24 h en dur');
});

test('un jeton perime reste refuse', () => {
  assert.match(SRC, /if \(payload\.exp < Date\.now\(\)\) return null;/);
});
