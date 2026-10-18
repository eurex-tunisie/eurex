/**
 * Installation de la partie cabinet sur le telephone (application « PWA ») et
 * mises a jour automatiques.
 *
 * - `sw.js` (web/public/sw.js) est enregistre a la racine de l'app (`/eurex/`)
 *   : c'est ce qui rend l'app installable depuis le navigateur du telephone
 *   (« Ajouter a l'ecran d'accueil » / « Installer l'application »).
 * - `updateViaCache: 'none'` + `reg.update()` : le navigateur ne se fie pas au
 *   cache HTTP pour le service worker, donc un nouveau deploiement est detecte.
 * - Quand la nouvelle version prend la main, la page tourne encore sur l'ancien
 *   code : on recharge, mais jamais pendant une saisie — tout de suite si
 *   l'utilisateur est ailleurs, sinon des qu'il quitte l'application.
 */

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

export function registerPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const dejaControle = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!dejaControle) return; // premiere installation : rien a recharger
    if (document.hidden) {
      window.location.reload();
      return;
    }
    document.addEventListener('visibilitychange', function surVisibilite() {
      if (!document.hidden) return;
      document.removeEventListener('visibilitychange', surVisibilite);
      window.location.reload();
    });
  });

  const enregistrer = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
      .then((enregistrement) => enregistrement.update().catch(() => {}))
      .catch(() => {});
  };

  if (document.readyState === 'complete') enregistrer();
  else window.addEventListener('load', enregistrer);
}
