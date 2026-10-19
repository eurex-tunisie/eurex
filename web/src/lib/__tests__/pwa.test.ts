// Application installable sur le telephone (PWA) + mises a jour automatiques.
//
// Ce qui est verifie ici :
//  1. le manifeste est INSTALLABLE (nom, display standalone, icone 192, icone 512,
//     icone maskable) et ouvre bien la partie cabinet ;
//  2. le service worker ne met JAMAIS en cache l'API (donnees de production) et
//     sert toujours la derniere version de l'HTML (reseau d'abord) — sinon
//     l'application resterait bloquee sur une vieille version ;
//  3. la page ne se recharge pas pendant une saisie : rechargement seulement en
//     dehors de l'application, ou des que l'utilisateur la quitte ;
//  4. rien de tout cela ne casse un premier chargement (pas de rechargement a la
//     premiere installation).
import { describe, test, expect, vi, afterEach } from 'vitest';
import manifeste from '../../../public/manifest.webmanifest?raw';
import swSrc from '../../../public/sw.js?raw';
import indexHtml from '../../../index.html?raw';
import mainSrc from '../../main.tsx?raw';
import pwaSrc from '../pwa.ts?raw';
import { registerPwa } from '../pwa';

type Ecouteur = (evenement: { type: string }) => void;

function fauxNavigateur(controle: boolean) {
  const ecouteurs: Record<string, Ecouteur[]> = {};
  const appels: { url: string; options: { scope: string; updateViaCache: string } }[] = [];
  const navigator = {
    serviceWorker: {
      controller: controle ? { state: 'activated' } : null,
      addEventListener: (type: string, ecouteur: Ecouteur) => {
        (ecouteurs[type] ||= []).push(ecouteur);
      },
      register: async (url: string, options: { scope: string; updateViaCache: string }) => {
        appels.push({ url, options });
        return { update: () => Promise.resolve() };
      },
    },
  };
  return { navigator, appels, ecouteurs };
}

function fauxDocument(masque: boolean) {
  const ecouteurs: Record<string, Ecouteur[]> = {};
  const document = {
    hidden: masque,
    readyState: 'complete',
    addEventListener: (type: string, ecouteur: Ecouteur) => {
      (ecouteurs[type] ||= []).push(ecouteur);
    },
    removeEventListener: (type: string, ecouteur: Ecouteur) => {
      ecouteurs[type] = (ecouteurs[type] || []).filter((e) => e !== ecouteur);
    },
  };
  return { document, ecouteurs };
}

function installer(controle: boolean, masque: boolean) {
  const sw = fauxNavigateur(controle);
  const doc = fauxDocument(masque);
  const rechargements = { n: 0 };
  vi.stubGlobal('navigator', sw.navigator);
  vi.stubGlobal('document', doc.document);
  vi.stubGlobal('window', {
    location: { reload: () => { rechargements.n += 1; } },
    addEventListener: () => {},
  });
  return { ...sw, ...doc, rechargements, declencher: (type: string, e: { type: string }) => (sw.ecouteurs[type] || []).forEach((f) => f(e)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('manifeste (installation sur le telephone)', () => {
  const manifesteLu = JSON.parse(manifeste) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    scope?: string;
    display?: string;
    theme_color?: string;
    icons?: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  test('JSON valide, installable en plein ecran', () => {
    expect(manifesteLu.name).toContain('EUREX');
    expect(manifesteLu.short_name).toBe('EUREX');
    expect(manifesteLu.display).toBe('standalone');
    expect(manifesteLu.theme_color).toBeTruthy();
  });

  test('ouvre directement la partie cabinet, dans le perimetre de l’app', () => {
    expect(manifesteLu.start_url).toBe('./cabinet');
    expect(manifesteLu.scope).toBe('./');
  });

  test('icones exigees par les navigateurs : 192, 512 et maskable', () => {
    const icones = manifesteLu.icons || [];
    const parTaille = (taille: string) => icones.find((i) => i.sizes === taille && i.type === 'image/png' && (i.purpose ?? 'any') === 'any');
    expect(parTaille('192x192')?.src).toBe('icons/icon-192.png');
    expect(parTaille('512x512')?.src).toBe('icons/icon-512.png');
    const maskable = icones.find((i) => i.purpose === 'maskable');
    expect(maskable?.sizes).toBe('512x512');
    expect(maskable?.src).toContain('maskable');
  });
});

describe('service worker', () => {
  test('prend la main tout de suite (mise a jour automatique)', () => {
    expect(swSrc).toContain("self.addEventListener('install'");
    expect(swSrc).toContain('self.skipWaiting()');
    expect(swSrc).toContain('self.clients.claim()');
  });

  test('ne met jamais en cache l’API ni une autre origine', () => {
    expect(swSrc).toContain('url.origin !== self.location.origin');
    expect(swSrc).not.toContain("'http"); // aucune URL absolue en dur dans le service worker
  });

  test('seuls les assets hashes sont en cache d’abord ; tout le reste vient du reseau', () => {
    expect(swSrc).toContain("const immutable = url.pathname.startsWith(`${BASE}assets/`);");
    expect(swSrc).toContain('return enCache || depuisReseau(cache, requete);'); // assets : cache d'abord
    expect(swSrc).toContain('const reponse = await depuisReseau(cache, requete);'); // tout le reste : reseau d'abord
    expect(swSrc).toContain('return reponse; // toujours la derniere version');
    expect(swSrc).toContain("if (!url.pathname.startsWith(BASE)) return;");
  });

  test('hors ligne : repli sur la page d’accueil gardee a l’installation', () => {
    expect(swSrc).toContain('await ranger(cache, BASE, await fetch(BASE));');
    expect(swSrc).toContain('const secours = await replier(cache, requete);');
    expect(swSrc).toContain('return (await cache.match(BASE)) || null;');
  });

  test('un 5xx sur une navigation sert la copie gardee (pas de page d’erreur)', () => {
    expect(swSrc).toContain("if (requete.mode === 'navigate' && reponse.status >= 500)");
  });

  test('cache borne (pas de croissance sans fin) et jamais de reponse 404 rangee', () => {
    expect(swSrc).toContain('MAX_ENTRIES');
    expect(swSrc).toContain('reponse.status !== 200');
  });

  test('perimetre calcule depuis l’adresse du service worker (base /eurex/)', () => {
    expect(swSrc).toContain("self.location.pathname.replace(/sw\\.js$/, '')");
  });
});

describe('page : referencement du manifeste', () => {
  test('manifeste, icone iOS, couleur de theme et favicon EUREX declares', () => {
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/icons/apple-touch-icon.png"');
    expect(indexHtml).toContain('name="theme-color" content="#6d28d9"');
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('rel="icon" type="image/png" href="/icons/favicon.png"');
    expect(indexHtml).not.toContain('vite.svg');
  });

  test('main.tsx enregistre l’application', () => {
    expect(mainSrc).toContain("from './lib/pwa'");
    expect(mainSrc).toContain('registerPwa()');
  });

  test('enregistrement a la racine de l’app, sans cache HTTP sur sw.js', () => {
    expect(pwaSrc).toContain('BASE_URL}sw.js');
    expect(pwaSrc).toContain("updateViaCache: 'none'");
    expect(pwaSrc).toContain('scope: import.meta.env.BASE_URL');
  });
});

describe('registerPwa : mise a jour sans jamais couper une saisie', () => {
  test('enregistre sw.js a la racine de l’app et cherche une mise a jour', async () => {
    const faux = installer(false, false);
    registerPwa();
    await vi.waitFor(() => expect(faux.appels.length).toBe(1));
    expect(faux.appels[0].url).toBe(`${import.meta.env.BASE_URL}sw.js`);
    expect(faux.appels[0].options.scope).toBe(import.meta.env.BASE_URL);
  });

  test('premier chargement : aucune page a recharger', async () => {
    const faux = installer(false, false);
    registerPwa();
    await vi.waitFor(() => expect(faux.appels.length).toBe(1));
    faux.declencher('controllerchange', { type: 'controllerchange' });
    expect(faux.rechargements.n).toBe(0);
  });

  test('nouvelle version pendant que l’utilisateur est ailleurs : rechargement immediat', async () => {
    const faux = installer(true, true);
    registerPwa();
    await vi.waitFor(() => expect(faux.appels.length).toBe(1));
    faux.declencher('controllerchange', { type: 'controllerchange' });
    expect(faux.rechargements.n).toBe(1);
  });

  test('nouvelle version pendant une saisie : rechargement seulement apres avoir quitte l’app', async () => {
    const faux = installer(true, false);
    registerPwa();
    await vi.waitFor(() => expect(faux.appels.length).toBe(1));
    faux.declencher('controllerchange', { type: 'controllerchange' });
    expect(faux.rechargements.n).toBe(0); // on ne coupe pas la saisie en cours
    faux.document.hidden = false;
    (faux.ecouteurs['visibilitychange'] || []).forEach((f) => f({ type: 'visibilitychange' }));
    expect(faux.rechargements.n).toBe(0); // toujours devant l'ecran
    faux.document.hidden = true;
    (faux.ecouteurs['visibilitychange'] || []).forEach((f) => f({ type: 'visibilitychange' }));
    expect(faux.rechargements.n).toBe(1);
  });
});
