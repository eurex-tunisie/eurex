const { chromium } = require('playwright');
const BASE = process.env.BASE;
const API = 'https://eurex-api.ezzinesalim21.workers.dev';
const EXP = { email: 'expert@eurex.tn', pwd: 'expert1234567' };
const SAL = { email: 'salim@eurex.tn', pwd: 'salim1234567' };
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS: ' : 'FAIL: ') + m); if (!c) fails++; };
async function bodyText(p) { return p.evaluate(() => document.body.innerText); }
async function waitText(p, sub, want, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if ((await bodyText(p)).includes(sub) === want) return true;
    await p.waitForTimeout(500);
  }
  return false;
}
async function j(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(url + ' -> ' + r.status + ' : ' + (await r.text().catch(() => '')));
  return r.json();
}
async function loginAs(p, email, pwd) {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => { localStorage.clear(); sessionStorage.setItem('eurex_authorized', '1'); });
  await p.goto(BASE + '/cabinet', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input[name="email"]', { timeout: 20000 });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', pwd);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(1500);
}

(async () => {
  const lh = await j(API + '/api/org/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EXP.email, password: EXP.pwd }) });
  const HE = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lh.token };
  const lc = await j(API + '/api/org/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: SAL.email, password: SAL.pwd }) });
  const HC = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + lc.token };

  const zz = 'ZZ-VERIFDASH-' + Date.now().toString().slice(-6);
  const client = await j(API + '/api/org/clients', { method: 'POST', headers: HE, body: JSON.stringify({ name: zz, assigned_comptable_id: 'user_comp_001' }) });
  const dossier = await j(API + `/api/org/clients/${client.id}/dossiers`, { method: 'POST', headers: HE, body: JSON.stringify({ exercice: 2026 }) });
  const cleanup = async () => {
    try { await j(API + '/api/org/clients/' + client.id, { method: 'DELETE', headers: HE }); console.log('CLEANUP: client ' + zz + ' supprimÃ© (cascade)'); }
    catch (e) { console.log('!! CLEANUP FAILED: ' + e.message); fails++; }
  };
  console.log('SETUP client=' + client.id + ' dossier=' + dossier.id + ' ' + zz);

  // TÃ¢che ajoutÃ©e MANUELLEMENT (created_by renseignÃ©) : seule catÃ©gorie admise
  // dans "ðŸ†• Nouvelles tÃ¢ches" â€” la checklist gÃ©nÃ©rÃ©e Ã  l'ouverture en est exclue.
  const recentTask = await j(API + '/api/org/dossiers/' + dossier.id + '/tasks', { method: 'POST', headers: HC, body: JSON.stringify({ label: 'ZZ-RECENT-' + Date.now().toString().slice(-6) }) });
  console.log('recent_task=' + recentTask.id);

  let b;
  try {
    const g0 = await j(API + '/api/org/dossiers/' + dossier.id, { headers: HC });
    // TÃ¢che du MOIS COURANT : le checklist est filtrÃ© sur le mois en cours par dÃ©faut
    const curMonth = new Date().getMonth() + 1;
    const task = g0.tasks.find(x => x.month === curMonth) || g0.tasks.find(x => x.month === null) || g0.tasks[0];
    console.log('task=' + task.id + ' month=' + task.month);

    // Salim (comptable) travaille et termine la tÃ¢che -> a_verifier
    await j(API + '/api/org/dossiers/' + dossier.id + '/tasks/' + task.id, { method: 'PATCH', headers: HC, body: JSON.stringify({ status: 'fait' }) });
    const g1 = await j(API + '/api/org/dossiers/' + dossier.id, { headers: HE });
    const t1 = g1.tasks.find(x => x.id === task.id);
    ok(t1.status === 'a_verifier', 'setup: tÃ¢che en a_verifier aprÃ¨s "fait" du comptable');
    ok(!!t1.done_by_name, 'setup: done_by_name renseignÃ© (' + t1.done_by_name + ')');

    b = await chromium.launch();
    const p = await b.newPage();
    p.on('pageerror', e => console.log('!! PAGEERROR: ' + e.message));
    p.on('dialog', async dg => { console.log('!! DIALOG[' + dg.type() + ']: ' + dg.message()); await dg.accept(); });

    // ---- U1-U4 : page dossier expert â€” tags ----
    await loginAs(p, EXP.email, EXP.pwd);
    await p.goto(BASE + '/cabinet/dossier/' + dossier.id, { waitUntil: 'domcontentloaded' });
    await p.locator('button', { hasText: /^Tous/ }).first().click({ timeout: 10000 }).catch(() => {});
    ok(await waitText(p, task.label, true), 'U1: tÃ¢che visible dans le dossier');
    ok(await waitText(p, 'Ã€ vÃ©rifier', true), 'U2: tag "â³ Ã€ vÃ©rifier" prÃ©sent (fait mais non vÃ©rifiÃ©)');
    ok(await p.locator('[data-testid="tag-a-verifier"]').count() >= 1, 'U2b: balise data-testid tag-a-verifier');
    const doneByTxt = await p.locator('[data-testid="tag-done-by"]').first().innerText();
    ok(doneByTxt.includes(t1.done_by_name), 'U3: tag "TravaillÃ© par ' + t1.done_by_name + '" (' + doneByTxt.replace(/\s+/g, ' ').trim() + ')');
    ok(await p.locator('[data-testid="tag-verified-by"]').count() === 0, 'U4: pas encore de tag "VÃ©rifiÃ© par"');

    // ---- U5-U9 : dashboard expert â€” carte "âœ… Ã€ vÃ©rifier" ----
    await p.goto(BASE + '/cabinet', { waitUntil: 'domcontentloaded' });
    ok(await waitText(p, 'Ã€ vÃ©rifier', true), 'U5: section "âœ… Ã€ vÃ©rifier" prÃ©sente dans le dashboard expert');
    // on filtre sur le label ET le nom du client (homonymes possibles)
    const card = p.locator('[data-testid="verify-task-card"]').filter({ hasText: task.label }).filter({ hasText: zz });
    ok(await card.count() === 1, 'U6: la tÃ¢che a sa carte de vÃ©rification (' + await card.count() + ')');
    const cTxt = await card.first().innerText();
    ok(cTxt.includes(zz) && cTxt.includes('Exercice 2026'), 'U7: la carte prÃ©cise le dossier (' + zz + ', exercice 2026)');
    ok(cTxt.includes(t1.done_by_name), 'U8: la carte indique qui a travaillÃ© (' + t1.done_by_name + ')');
    const delayTxt = await card.first().locator('[data-testid="verify-task-delay"]').innerText();
    ok(/(h restantes|min restantes|Sans dÃ©lai)/.test(delayTxt), 'U9: dÃ©lai de validation affichÃ© (' + delayTxt + ')');

    // ---- U18-U19 : carte "ðŸ†• Nouvelles tÃ¢ches" aussi sur le dashboard expert ----
    // (le feed arrive en parallÃ¨le : on attend la section avant de compter)
    const ntSection = p.locator('[data-testid="nouvelles-taches"]').first();
    ok(await ntSection.waitFor({ timeout: 20000 }).then(() => true).catch(() => false), 'U18: carte "ðŸ†• Nouvelles tÃ¢ches" prÃ©sente sur le dashboard expert');
    ok(await p.locator('[data-testid="recent-task-card"]').count() >= 1, 'U19: au moins une tÃ¢che rÃ©cente listÃ©e (' + await p.locator('[data-testid="recent-task-card"]').count() + ')');
    const rc = p.locator('[data-testid="recent-task-card"]').first();
    ok(/\d{2}\/\d{4} Ã  \d{2}h\d{2}/.test(await rc.locator('[data-testid="recent-task-created"]').innerText()), 'U20: date/heure de crÃ©ation formatÃ©e (DD/MM/YYYY Ã  HHhMM)');
    ok((await rc.locator('[data-testid="recent-task-rest"]').innerText()).length > 0, 'U21: badge "temps restant" affichÃ©');

    // ---- U10 : validation en un clic depuis la carte ----
    await card.first().locator('[data-testid="verify-task-btn"]').click();
    await p.waitForTimeout(2500);
    ok(await card.count() === 0, 'U10: la carte disparaÃ®t aprÃ¨s validation');

    // ---- U11-U13 : la tÃ¢che est maintenant "âœ… VÃ©rifiÃ© par" ----
    await p.goto(BASE + '/cabinet/dossier/' + dossier.id, { waitUntil: 'domcontentloaded' });
    await waitText(p, task.label, true);
    ok(await p.locator('[data-testid="tag-fait"]').count() >= 1, 'U11: tag "âœ… VÃ©rifiÃ©" affichÃ©');
    const verTxt = await p.locator('[data-testid="tag-verified-by"]').first().innerText();
    ok(verTxt.includes('VÃ©rifiÃ© par') && verTxt.includes('Omar'), 'U12: tag "âœ“ VÃ©rifiÃ© par Omar" (' + verTxt.replace(/\s+/g, ' ').trim() + ')');
    const done2 = await p.locator('[data-testid="tag-done-by"]').first().innerText();
    ok(done2.includes(t1.done_by_name), 'U13: "TravaillÃ© par" intact aprÃ¨s validation (' + t1.done_by_name + ')');

    // ---- U14-U16 : vÃ©rifications API ----
    const gf = await j(API + '/api/org/dossiers/' + dossier.id, { headers: HE });
    const tf = gf.tasks.find(x => x.id === task.id);
    ok(tf.status === 'fait', 'U14: statut final = fait (API)');
    ok(tf.verified_by_name === 'Omar', 'U15: verified_by = Omar (API)');
    const feed = await j(API + '/api/org/tasks/verify', { headers: HE });
    ok(!feed.tasks.some(x => x.id === task.id), 'U16: sortie du feed /org/tasks/verify');
  } finally {
    if (b) await b.close().catch(() => {});
    await cleanup();
  }

  const left = await j(API + '/api/org/clients', { headers: HE });
  ok(!left.some(c => c.id === client.id), 'U17: aucun rÃ©sidu client');

  console.log(fails ? fails + ' FAILURES' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(2); });
