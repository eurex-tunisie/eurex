// Politique de session du cabinet : « une fois connecte, on reste connecte ».
//
// Le jeton vit un an cote API et le code d'acces est redemande a chaque
// ouverture : l'utilisateur ne doit donc retaper QUE le code. Sans cette regle,
// le moindre incident (telephone hors ligne, Worker indisponible, erreur 500)
// faisait oublier la session et renvoyait a l'ecran email + mot de passe — ce
// que l'utilisateur ne voulait plus. Seul un 401 (jeton refuse par le serveur :
// expire, signe autrement, compte desactive) deconnecte.
import { describe, test, expect } from 'vitest';
import { doitOublierSession } from '../orgSession';
import orgAuthSrc from '../orgAuth.tsx?raw';

describe('doitOublierSession : seul un refus du serveur deconnecte', () => {
  test('401 (jeton refuse) : on oublie la session', () => {
    expect(doitOublierSession(401)).toBe(true);
  });

  test('erreurs serveur (500, 502, 503, 504) : on reste connecte', () => {
    for (const statut of [500, 502, 503, 504]) expect(doitOublierSession(statut)).toBe(false);
  });

  test('reseau coupe (statut inconnu) : on reste connecte', () => {
    expect(doitOublierSession(null)).toBe(false);
    expect(doitOublierSession(0)).toBe(false);
  });

  test('autres refus (400, 403, 404, 429) : on reste connecte', () => {
    for (const statut of [400, 403, 404, 429]) expect(doitOublierSession(statut)).toBe(false);
  });
});

describe('orgAuth : branchement de la regle', () => {
  test('refreshMe applique la regle sur le statut de /org/auth/me', () => {
    expect(orgAuthSrc).toContain("import { doitOublierSession } from './orgSession'");
    expect(orgAuthSrc).toContain('if (doitOublierSession(r.status)) { oublierSession();');
  });

  test('la session n’est oubliee qu’a deux endroits : 401 et « se deconnecter »', () => {
    // Un troisieme appel (par exemple dans le catch reseau) remettrait
    // l'utilisateur a l'ecran de connexion apres une simple coupure.
    expect((orgAuthSrc.match(/oublierSession\(\);/g) || []).length).toBe(2);
  });

  test('un rafraichissement impossible garde le token et l’utilisateur en cache', () => {
    expect(orgAuthSrc).toContain('const enCache = lireUtilisateurEnCache();');
    expect(orgAuthSrc).toContain('setState({ token, user: enCache, loading: false });');
  });
});
