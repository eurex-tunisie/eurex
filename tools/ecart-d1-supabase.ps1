<#
  Controle d'ecart entre D1 (base primaire) et Supabase / PostgreSQL (copie).

  Repond a une seule question : les deux bases contiennent-elles exactement la
  meme chose ? Le controle se fait en quatre etapes, de la plus large a la plus
  fine, et chaque etape est independante.

      compteurs : le nombre de lignes de chaque table, des deux cotes
      schema    : les colonnes et leurs types, des deux cotes
      valeurs   : le contenu, table par table (empreinte md5 de toutes les
                  valeurs), puis par colonne et par ligne en cas d'ecart
      colonne   : detail d'une colonne (et des lignes concernees)

  Usage :
      & tools/ecart-d1-supabase.ps1 -Etape compteurs
      & tools/ecart-d1-supabase.ps1 -Etape schema
      & tools/ecart-d1-supabase.ps1 -Etape valeurs
      & tools/ecart-d1-supabase.ps1 -Etape valeurs -Table org_tasks
      & tools/ecart-d1-supabase.ps1 -Etape colonne -Table org_clients
      & tools/ecart-d1-supabase.ps1 -Etape colonne -Table org_clients -Colonne portal_token

  Prerequis :
    - le secret interne du Worker (EUREX_INTERNAL_SECRET), lu par defaut dans
      api/local/.env (fichier ignore par git). Le controle passe par
      /internal/pg, qui exige ce secret et doit rester reserve a l'exploitant.
    - wrangler authentifie (le controle interroge D1 en --remote).
    - Hyperdrive configure cote Worker (seul chemin Worker -> PostgreSQL qui
      fonctionne, et caching.disabled doit rester a true).

  Comment le verdict remonte :
    /internal/pg ne renvoie que le NOMBRE de lignes lues, jamais les donnees.
    PostgreSQL calcule donc lui-meme le verdict et le fait sortir dans un
    RAISE EXCEPTION, que ce script lit. C'est ce qui permet de comparer des
    tables entieres sans transferer les lignes.

  A savoir sur les limites :
    - Les colonnes a virgule flottante sont exclues de l'empreinte texte et
      verifiees a part (nombre de valeurs, valeurs distinctes, somme au centime).
    - Les colonnes d'horodatage (nom en *_at) sont comparees A LA MINUTE. Chaque
      base evalue son propre datetime('now') au moment de son ecriture (voir la
      traduction dans src/pg/translate.ts) et les deux ecritures sont
      sequentielles : un ecart d'une seconde est donc normal et sans effet. Une
      difference d'au moins une minute, elle, est signalee.
    - Les dates portees par les donnees (due_date, date_facture, date_naissance,
      ...) ne finissent pas par _at : elles sont comparees a l'identique.
#>
param(
  [ValidateSet('compteurs', 'schema', 'valeurs', 'colonne')]
  [string]$Etape = 'compteurs',
  [string]$Table = '',
  [string]$Colonne = '',
  [string]$Worker = 'https://eurex-api.ezzinesalim21.workers.dev',
  [string]$EnvFile = ''
)

# Pas de $ErrorActionPreference = 'Stop' : wrangler ecrit sur stderr meme quand
# tout va bien, et PowerShell transformerait cela en erreur fatale.
$env:NO_COLOR = '1'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# wrangler lit api/wrangler.jsonc : on lui donne le chemin explicitement, pour
# ne pas dependre du dossier courant et rester appelable plusieurs fois dans la
# meme session PowerShell.
$apiDir = (Resolve-Path (Join-Path $PSScriptRoot '..\api')).Path
$config = Join-Path $apiDir 'wrangler.jsonc'

# ---------------------------------------------------------------- utilitaires

function Get-Secret {
  if (-not $EnvFile) {
    $EnvFile = Join-Path $PSScriptRoot '..\api\local\.env'
  }
  if (-not (Test-Path $EnvFile)) {
    throw "secret interne introuvable : $EnvFile absent. Recreer api/local/.env avec EUREX_INTERNAL_SECRET=..."
  }
  $ligne = Get-Content $EnvFile | Where-Object { $_ -match '^EUREX_INTERNAL_SECRET=' }
  if (-not $ligne) { throw "EUREX_INTERNAL_SECRET absent de $EnvFile" }
  return ($ligne -replace '^EUREX_INTERNAL_SECRET=', '').Trim()
}

# Interroge D1 et renvoie les lignes du premier resultat (JSON de wrangler).
function Get-D1([string]$sql) {
  $sortie = npx wrangler d1 execute eurex-db --remote --config $config --command $sql 2>&1 | Out-String
  # wrangler colore ses messages : on retire les sequences ANSI avant le JSON.
  $sortie = $sortie -replace ([char]27 + '\[[0-9;]*[A-Za-z]'), ''
  $m = [regex]::Match($sortie, '\[\s*\{\s*"results"')
  if (-not $m.Success) {
    $propre = ($sortie -replace '[^\x20-\x7E\r\n]', '.') -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 6
    throw ('requete D1 en echec. SQL : ' + $sql.Substring(0, [Math]::Min(120, $sql.Length)) + ' ... Reponse : ' + (($propre | ForEach-Object { $_.Trim() }) -join ' | '))
  }
  $json = $sortie.Substring($m.Index, $sortie.LastIndexOf(']') - $m.Index + 1)
  return ($json | ConvertFrom-Json)[0].results
}

# Pose une question a PostgreSQL : le resultat doit sortir dans un RAISE.
function Invoke-Pg([string]$sql, [string]$secret) {
  $corps = @{ sql = $sql } | ConvertTo-Json -Compress
  $fichier = Join-Path ([System.IO.Path]::GetTempPath()) ('eurex-pg-' + [Guid]::NewGuid().ToString('N') + '.json')
  [System.IO.File]::WriteAllText($fichier, $corps, (New-Object System.Text.UTF8Encoding($false)))
  try {
    # curl.exe est utilise car Invoke-WebRequest perd le corps des reponses 500.
    $brut = curl.exe -s -X POST -H "X-Internal-Secret: $secret" -H 'Content-Type: application/json' --data-binary "@$fichier" "$Worker/internal/pg"
  } finally {
    Remove-Item $fichier -ErrorAction SilentlyContinue
  }
  if (-not $brut) { throw 'aucune reponse de /internal/pg (secret refuse, ou Worker injoignable ?)' }
  $rep = $brut | ConvertFrom-Json
  if ($rep.ok) { return 'OK' }
  return [string]$rep.error
}

function Get-Md5([string]$s) {
  $md5 = [System.Security.Cryptography.MD5]::Create()
  return (($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s)) | ForEach-Object { $_.ToString('x2') }) -join '')
}

# ------------------------------------------------------- etat des deux bases

$secret = Get-Secret

# Tables de D1, avec leurs colonnes et types (pragma_table_info = source exacte).
# On evite <> dans le SQL : PowerShell deforme ces deux caracteres au passage
# a node, d'ou le NOT IN.
$sql = "SELECT group_concat(name, ',') AS t FROM (SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations','_cf_KV') ORDER BY name)"
$tables = @((Get-D1 $sql)[0].t -split ',')
$colsD1 = @()
foreach ($t in $tables) { $colsD1 += ("(SELECT group_concat(name || ':' || lower(type), ',') FROM pragma_table_info('" + $t + "')) AS " + $t) }
$d1map = @{}
foreach ($p in ((Get-D1 ('SELECT ' + ($colsD1 -join ', ')))[0]).PSObject.Properties) { $d1map[$p.Name] = @($p.Value -split ',') }

# Colonnes et types de PostgreSQL, par tranches (les messages d'erreur sont courts).
$pgmap = @{}
for ($off = 0; $off -lt $tables.Count; $off += 12) {
  $q = "DO `$`$ DECLARE l text; BEGIN SELECT string_agg(table_name || '.' || column_name || ':' || udt_name, ', ' ORDER BY table_name, ordinal_position) INTO l FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' GROUP BY table_name ORDER BY table_name OFFSET $off LIMIT 12); RAISE EXCEPTION 'COLS %', COALESCE(l, ''); END `$`$;"
  $rep = (Invoke-Pg $q $secret) -replace '^COLS ', ''
  foreach ($e in ($rep -split ', ')) {
    if ($e -match '^([^.]+)\.([^:]+):(.+)$') {
      if (-not $pgmap.ContainsKey($Matches[1])) { $pgmap[$Matches[1]] = @() }
      $pgmap[$Matches[1]] += ($Matches[2] + ':' + $Matches[3])
    }
  }
}

# ------------------------------------------------------------- etape compteurs

if ($Etape -eq 'compteurs') {
  '  compteurs D1 <-> PostgreSQL'
  ''
  $parts = @()
  foreach ($t in $tables) { $parts += ('(SELECT count(*) FROM ' + $t + ') AS ' + $t) }
  $ligne = (Get-D1 ('SELECT ' + ($parts -join ', ')))[0]

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("DO `$`$ DECLARE msg text := ''; n bigint; BEGIN ")
  $total = 0
  foreach ($p in $ligne.PSObject.Properties) {
    $t = $p.Name; $n = [int]$p.Value; $total += $n
    [void]$sb.Append("IF to_regclass('public.$t') IS NULL THEN msg := msg || 'ABSENTE cote PG: $t; '; ELSE EXECUTE 'SELECT count(*) FROM $t' INTO n; IF n <> $n THEN msg := msg || '${t}: D1=$n PG=' || n || '; '; END IF; END IF; ")
  }
  [void]$sb.Append("IF msg <> '' THEN RAISE EXCEPTION 'ECART %', msg; END IF; END `$`$;")
  $verdict = Invoke-Pg $sb.ToString() $secret

  if ($verdict -eq 'OK') {
    '    ' + $tables.Count + ' tables, ' + $total + ' lignes : compteurs identiques des deux cotes.'
  } else {
    '    ECART : ' + ($verdict -replace '^ECART ', '')
  }
  exit 0
}

# --------------------------------------------------------------- etape schema

if ($Etape -eq 'schema') {
  '  colonnes et types D1 <-> PostgreSQL'
  ''
  $ecarts = 0
  foreach ($t in $tables) {
    $nomsD1 = @($d1map[$t] | ForEach-Object { ($_ -split ':')[0] })
    $nomsPG = @($pgmap[$t] | ForEach-Object { ($_ -split ':')[0] })
    $manquantes = @($nomsD1 | Where-Object { $nomsPG -notcontains $_.ToLower() })
    $enTrop = @($nomsPG | Where-Object { ($nomsD1 | ForEach-Object { $_.ToLower() }) -notcontains $_ })
    $types = ''
    foreach ($c in $d1map[$t]) {
      $n = ($c -split ':')[0]; $ty = ($c -split ':')[1]
      $pgType = (($pgmap[$t] | Where-Object { $_ -like ($n.ToLower() + ':*') }) -split ':')[1]
      if (-not $pgType) { continue }
      $attendu = switch -Regex ($ty) {
        '^text'      { 'text|varchar|bpchar' }
        '^integer'   { 'int8|int4|int2|numeric' }
        '^real|^double|^float|^numeric' { 'float8|float4|numeric' }
        '^blob'      { 'bytea' }
        default      { '' }
      }
      if ($attendu -and ($pgType -notmatch "^($attendu)$")) { $types += " ${n}: D1=$ty PG=$pgType;" }
    }
    if ($manquantes.Count -or $enTrop.Count -or $types) {
      $ecarts++
      '    ' + $t + ' : DIFFERENT'
      if ($manquantes.Count) { '        colonnes absentes cote PostgreSQL : ' + ($manquantes -join ', ') }
      if ($enTrop.Count) { '        colonnes en trop cote PostgreSQL    : ' + ($enTrop -join ', ') }
      if ($types) { '        types :' + $types }
    } else {
      '    ' + $t.PadRight(28) + ' : identique (' + $nomsD1.Count + ' colonnes)'
    }
  }
  ''
  '  tables avec ecart de schema : ' + $ecarts + ' / ' + $tables.Count
  exit 0
}

# -------------------------------------------------------------- etape valeurs

function Compare-Table([string]$t, [string]$secret) {
  $cols = @($d1map[$t])
  $d1Exprs = @(); $pgExprs = @(); $flottants = @(); $cle = $cols[0].Split(':')[0]
  foreach ($c in $cols) {
    $n = ($c -split ':')[0]; $ty = ($c -split ':')[1]; $pn = $n.ToLower()
    if ($pn -eq 'id') { $cle = 'id' }
    if ($ty -match '^(real|double|float|numeric|decimal)') { $flottants += $n; continue }
    # Separateur : caractere de controle 31, peu probable dans les donnees.
    # Les horodatages (*_at) sont ramenes a la minute : voir l'entete.
    if ($pn -match '_at$') {
      $d1Exprs += "substr(COALESCE(CAST($n AS TEXT),'<N>'),1,16)"
      $pgExprs += "left(COALESCE($pn::text,'<N>'),16)"
    } else {
      $d1Exprs += "COALESCE(CAST($n AS TEXT),'<N>')"
      $pgExprs += "COALESCE($pn::text,'<N>')"
    }
  }
  $d1Row = ($d1Exprs -join ' || char(31) || ')
  $pgRow = ($pgExprs -join ' || chr(31) || ')

  $rows = Get-D1 ("SELECT group_concat(x, char(10)) AS fp FROM (SELECT $d1Row AS x FROM $t ORDER BY $cle)")
  $chaine = $rows[0].fp
  $md5D1 = if ($null -eq $chaine) { 'NULL' } else { Get-Md5 $chaine }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("DO `$`$ DECLARE msg text := ''; BEGIN ")
  [void]$sb.Append("IF (SELECT md5(string_agg($pgRow, chr(10) ORDER BY $cle COLLATE `"C`")) FROM $t) IS DISTINCT FROM '$md5D1' THEN msg := msg || 'valeurs; '; END IF; ")
  foreach ($f in $flottants) {
    $pf = $f.ToLower()
    $vD1 = (Get-D1 "SELECT count($f) || '/' || count(DISTINCT $f) || '/' || CAST(COALESCE(round(sum($f)*100), -1) AS INTEGER) AS v FROM $t")[0].v
    $exp = "count($pf) || '/' || count(DISTINCT $pf) || '/' || COALESCE(round(sum($pf)*100)::bigint, -1)"
    [void]$sb.Append("IF (SELECT $exp FROM $t) IS DISTINCT FROM '$vD1' THEN msg := msg || '$f; '; END IF; ")
  }
  [void]$sb.Append("IF msg <> '' THEN RAISE EXCEPTION 'ECART %', msg; END IF; END `$`$;")
  return (Invoke-Pg $sb.ToString() $secret)
}

if ($Etape -eq 'valeurs') {
  $liste = if ($Table) { @($Table -split ',') } else { $tables }
  '  valeurs D1 <-> PostgreSQL'
  ''
  $ecarts = 0
  foreach ($t in $liste) {
    $n = (Get-D1 "SELECT count(*) AS n FROM $t")[0].n
    if (-not $n) { '    ' + $t.PadRight(28) + ' : vide'; continue }
    $verdict = Compare-Table $t $secret
    if ($verdict -eq 'OK') {
      '    ' + $t.PadRight(28) + ' : ' + ([string]$n).PadLeft(5) + ' lignes, valeurs identiques'
    } else {
      $ecarts++
      '    ' + $t.PadRight(28) + ' : ' + ([string]$n).PadLeft(5) + ' lignes, DIFFERENT -> ' + ($verdict -replace '^ECART ', '')
    }
  }
  ''
  '  tables en ecart : ' + $ecarts + ' / ' + $liste.Count
  if ($ecarts) { '  Pour le detail : -Etape colonne -Table <nom>' }
  exit 0
}

# -------------------------------------------------------------- etape colonne

if ($Etape -eq 'colonne') {
  if (-not $Table) { throw 'preciser -Table <nom>' }
  $cols = @($d1map[$Table])
  $cle = $cols[0].Split(':')[0]
  if ($cols | Where-Object { ($_ -split ':')[0].ToLower() -eq 'id' }) { $cle = 'id' }

  if ($Colonne) {
    $pc = $Colonne.ToLower()
    $estAt = ($pc -match '_at$')
    if ($estAt) {
      $exprD1 = "substr(COALESCE(CAST($Colonne AS TEXT),'<N>'),1,16)"
      $exprPG = "left(COALESCE($pc::text,'<N>'),16)"
    } else {
      $exprD1 = "COALESCE(CAST($Colonne AS TEXT),'<N>')"
      $exprPG = "COALESCE($pc::text,'<N>')"
    }
    $chaine = (Get-D1 "SELECT group_concat(x, char(10)) AS fp FROM (SELECT $cle || '=' || $exprD1 AS x FROM $Table ORDER BY $cle)")[0].fp
    $paires = @()
    foreach ($l in ($chaine -split "`n")) {
      if (-not $l) { continue }
      $i = $l.IndexOf('='); $paires += @{ id = $l.Substring(0, $i); v = $l.Substring($i + 1) }
    }
    '  colonne ' + $Colonne + ' de ' + $Table + ' : ' + $paires.Count + ' lignes comparees' + $(if ($estAt) { ' (horodatage, compare a la minute)' } else { '' })
    # Extrait affiche : un horodatage se lit en entier, les autres valeurs sont
    # tronquees a 8 caracteres (un jeton ou un condensat n'a pas a s'etaler ici).
    $extrait = if ($estAt) { 19 } else { 8 }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("DO `$`$ DECLARE msg text := ''; BEGIN ")
    foreach ($p in $paires) {
      $h = Get-Md5 $p.v
      [void]$sb.Append("IF (SELECT md5($exprPG) FROM $Table WHERE $cle = '$($p.id)') IS DISTINCT FROM '$h' THEN msg := msg || 'ligne $($p.id) (D1=$($p.v.Substring(0, [Math]::Min($extrait, $p.v.Length)))); '; END IF; ")
    }
    [void]$sb.Append("IF msg = '' THEN msg := 'aucune ligne differente'; END IF; RAISE EXCEPTION '%', msg; END `$`$;")
    '    ' + (Invoke-Pg $sb.ToString() $secret)
    exit 0
  }

  '  colonnes de ' + $Table
  ''
  $diffs = @()
  foreach ($c in $cols) {
    $nom = ($c -split ':')[0]; $ty = ($c -split ':')[1]; $pn = $nom.ToLower()
    if ($ty -match '^(real|double|float|numeric|decimal)') {
      $vD1 = (Get-D1 "SELECT count($nom) || '/' || count(DISTINCT $nom) || '/' || CAST(COALESCE(round(sum($nom)*100), -1) AS INTEGER) AS v FROM $Table")[0].v
      $q = "DO `$`$ DECLARE m text; BEGIN SELECT count($pn) || '/' || count(DISTINCT $pn) || '/' || COALESCE(round(sum($pn)*100)::bigint, -1) INTO m FROM $Table; RAISE EXCEPTION 'V %', m; END `$`$;"
      $vPG = (Invoke-Pg $q $secret) -replace '^V ', ''
      $ok = ($vD1 -eq $vPG)
      '    ' + $nom.PadRight(24) + ' : ' + $(if ($ok) { 'identique' } else { 'DIFFERENT (D1=' + $vD1 + ' PG=' + $vPG + ')' })
    } else {
      $estAt = ($pn -match '_at$')
      if ($estAt) {
        $exprD1 = "substr(COALESCE(CAST($nom AS TEXT),'<N>'),1,16)"
        $exprPG = "left(COALESCE($pn::text,'<N>'),16)"
      } else {
        $exprD1 = "COALESCE(CAST($nom AS TEXT),'<N>')"
        $exprPG = "COALESCE($pn::text,'<N>')"
      }
      $chaine = (Get-D1 "SELECT group_concat(x, char(10)) AS fp FROM (SELECT $exprD1 AS x FROM $Table ORDER BY $cle)")[0].fp
      if ($null -eq $chaine) { '    ' + $nom.PadRight(24) + ' : (colonne vide)'; continue }
      $h = Get-Md5 $chaine
      $q = "DO `$`$ BEGIN IF (SELECT md5(string_agg($exprPG, chr(10) ORDER BY $cle COLLATE `"C`")) FROM $Table) IS DISTINCT FROM '$h' THEN RAISE EXCEPTION 'DIFF'; END IF; RAISE EXCEPTION 'MEME'; END `$`$;"
      $ok = ((Invoke-Pg $q $secret) -eq 'MEME')
      '    ' + $nom.PadRight(24) + ' : ' + $(if ($ok) { 'identique' } else { 'DIFFERENT' }) + $(if ($estAt) { '  (a la minute)' } else { '' })
    }
    if (-not $ok) { $diffs += $nom }
  }
  ''
  '  colonnes differentes : ' + $(if ($diffs.Count) { $diffs -join ', ' } else { 'aucune' })
  if ($diffs.Count -eq 1) { '  Detail des lignes : -Etape colonne -Table ' + $Table + ' -Colonne ' + $diffs[0] }
  exit 0
}
