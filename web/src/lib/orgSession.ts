/**
 * Politique de session du cabinet.
 *
 * Le jeton du cabinet vit un an (voir ORG_TOKEN_TTL_MS cote API) et l'acces est
 * de toute facon redemande a chaque ouverture par le code d'acces (AccessGate) :
 * une fois connecte, l'utilisateur doit donc rester connecte et ne retaper que
 * le code.
 *
 * Seul un refus explicite du serveur fait oublier la session : 401 (jeton
 * expire, signe autrement, ou compte desactive). Un telephone hors ligne, un
 * Worker indisponible ou une erreur 500 ne sont PAS des deconnexions — sinon la
 * moindre coupure reseau obligeait a retaper email + mot de passe.
 */
export function doitOublierSession(statut: number | null): boolean {
  return statut === 401;
}
