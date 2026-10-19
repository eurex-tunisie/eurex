// Identifiants des tests UI.
//
// Ce module ne contient AUCUN mot de passe : il lit .credentials.json, qui est
// dans .gitignore. Le depot est PUBLIC - toute valeur ecrite ici serait lisible
// par n'importe qui, et un mot de passe publie doit etre considere comme perdu.
//
// Copier .credentials.example.json vers .credentials.json et y mettre les
// vrais identifiants. Sans ce fichier, les tests s'arretent net avec un
// message explicite plutot que de passer inapercus en 401.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '.credentials.json');
if (!fs.existsSync(file)) {
  throw new Error(
    'Identifiants absents : ' + file + '\n' +
    '  Copier .credentials.example.json vers .credentials.json et le remplir.\n' +
    '  Ce fichier est ignore par git, jamais il ne doit etre pousse.'
  );
}

let raw;
try {
  raw = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  throw new Error('Fichier ' + file + ' illisible (JSON invalide) : ' + e.message);
}

// Chaque compte doit avoir email ET password, sinon le test echouerait de
// toute facon - autant le dire tot.
for (const [nom, c] of Object.entries(raw)) {
  if (!c || typeof c.email !== 'string' || typeof c.password !== 'string' || !c.email || !c.password) {
    throw new Error('Compte "' + nom + '" incomplet dans ' + file + ' (email et password requis)');
  }
}

module.exports = raw;
