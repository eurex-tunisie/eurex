// Service worker EUREX.
//
// But : permettre l'installation de la partie cabinet comme application sur le
// telephone (l'installation exige un service worker qui repond aux requetes), et
// faire en sorte que chaque nouveau deploiement soit pris en compte TOUT SEUL.
//
// Regles :
//  - jamais l'API (autre origine : eurex-api…workers.dev) ni aucune autre origine ;
//  - HTML (index.html, y compris la copie 404.html de GitHub Pages) et le reste :
//    reseau d'abord -> on ouvre toujours la derniere version publiee, le cache ne
//    sert qu'hors ligne ;
//  - /assets/... : cache d'abord — Vite y met des noms de fichiers hashes, donc
//    immuables (et ça evite de casser un morceau de code charge a la demande
//    apres un redeploiement) ;
//  - l'application (page d'accueil) est gardee en cache des l'installation pour
//    pouvoir s'ouvrir hors ligne.
//
// Ce fichier est servi tel quel depuis web/public/ : il ne contient aucun nom
// d'asset, donc rien a regenerer a chaque build.

const BASE = self.location.pathname.replace(/sw\.js$/, ''); // « /eurex/ »
const CACHE = 'eurex-v1';
const MAX_ENTRIES = 200;

async function ranger(cache, requete, reponse) {
  // On ne range que des reponses completement OK : jamais le 404 de la
  // redirection SPA de GitHub Pages, jamais une reponse partielle.
  if (!reponse || !reponse.ok || reponse.status !== 200) return;
  await cache.put(requete, reponse.clone());
  const cles = await cache.keys();
  if (cles.length <= MAX_ENTRIES) return;
  for (const cle of cles.slice(0, cles.length - MAX_ENTRIES)) await cache.delete(cle);
}

async function depuisReseau(cache, requete) {
  const reponse = await fetch(requete);
  await ranger(cache, requete, reponse);
  return reponse;
}

// Repli hors ligne : la page demandee si on l'a, sinon la page d'accueil gardee
// a l'installation (null si vraiment rien).
async function replier(cache, requete) {
  const enCache = await cache.match(requete);
  if (enCache) return enCache;
  return (await cache.match(BASE)) || null;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await ranger(cache, BASE, await fetch(BASE)); // page d'accueil disponible hors ligne
      } catch {
        // hors ligne a l'installation : le cache se remplira au premier chargement
      }
      // On ne garde pas un ancien service worker en attente : il prend la main tout de suite.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(noms.filter((nom) => nom !== CACHE).map((nom) => caches.delete(nom)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return; // API : toujours le reseau, jamais de cache
  if (!url.pathname.startsWith(BASE)) return; // hors de l'application

  const immutable = url.pathname.startsWith(`${BASE}assets/`);

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (immutable) {
        const enCache = await cache.match(requete);
        return enCache || depuisReseau(cache, requete); // nom hashe : jamais perime
      }

      try {
        const reponse = await depuisReseau(cache, requete);
        // Un 5xx sur une navigation (serveur en panne) n'est pas une nouvelle
        // version : on sert la copie gardee plutot que d'afficher une page
        // d'erreur a la place de l'application.
        if (requete.mode === 'navigate' && reponse.status >= 500) {
          const secours = await replier(cache, requete);
          if (secours) return secours;
        }
        return reponse; // toujours la derniere version
      } catch (erreur) {
        const secours = await replier(cache, requete);
        if (secours) return secours;
        throw erreur;
      }
    })()
  );
});
