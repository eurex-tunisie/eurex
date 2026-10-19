# Identifiants des tests UI - version PowerShell.
#
# Aucun mot de passe ici : ce module lit .credentials.json, qui est dans
# .gitignore. Le depot est PUBLIC - toute valeur ecrite ici serait lisible
# par n'importe qui, et un mot de passe publie doit etre considere comme perdu.
#
# Usage :   . "$PSScriptRoot\creds.ps1"     # puis $CRED.expert.email, ...
#
# PS 5.1 lit ce fichier en ANSI : il reste strictement ASCII.
$ErrorActionPreference = 'Stop'

$CRED_FILE = Join-Path $PSScriptRoot '.credentials.json'
if (-not (Test-Path $CRED_FILE)) {
  throw ("Identifiants absents : $CRED_FILE`n" +
         "  Copier .credentials.example.json vers .credentials.json et le remplir.`n" +
         "  Ce fichier est ignore par git, jamais il ne doit etre pousse.")
}

try {
  $script:CRED = Get-Content $CRED_FILE -Raw | ConvertFrom-Json
} catch {
  throw "Fichier $CRED_FILE illisible (JSON invalide) : $($_.Exception.Message)"
}

# Chaque compte doit avoir email ET password.
foreach ($p in $CRED.PSObject.Properties) {
  $c = $p.Value
  if (-not $c.email -or -not $c.password) {
    throw "Compte '$($p.Name)' incomplet dans $CRED_FILE (email et password requis)"
  }
}
