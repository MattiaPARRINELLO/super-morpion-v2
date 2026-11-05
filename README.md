# Super Morpion

Le **Super Tic-Tac-Toe** multijoueur, en temps réel, dans le navigateur.

Chaque case de la grille principale contient elle-même un morpion : le coup joué
détermine dans quel sous-plateau l'adversaire doit répondre. C'est simple à
apprendre, beaucoup moins à maîtriser.

**Jouer : [supermrp.mattiaparrinello.fr](https://supermrp.mattiaparrinello.fr/)**

## Fonctionnalités

- Multijoueur en temps réel (Socket.IO), sans compte
- Salons privés partagés par lien
- Reconnexion automatique en cas de coupure
- Validation des coups côté serveur, le client ne fait pas autorité
- Thème clair et sombre

## Stack

| Technologie | Rôle |
|---|---|
| Node.js + Express | Serveur et fichiers statiques |
| Socket.IO | Synchronisation temps réel |
| JavaScript vanilla | Interface, sans framework |

## Lancer en local

```bash
git clone https://github.com/MattiaPARRINELLO/super-morpion-v2.git
cd super-morpion-v2
npm install
npm start
```

Le serveur écoute sur le port défini par `PORT` (3000 par défaut).

## Structure

```
server.js       serveur Express + logique Socket.IO
script.js       client : rendu du plateau et événements
index.html      page de jeu
createPage.js   génération de la page
styles.css      styles, thèmes clair et sombre
```

## Licence

MIT, voir [LICENSE](./LICENSE).
