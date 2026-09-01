# Locly

**Le marketplace de location avec preuve.**

Locly est une application web full-stack permettant de publier et louer du matériel, de créer des locations, d'enregistrer des vidéos d'état des lieux avant/après, de gérer une réputation vérifiée et de signaler les incidents.

## Fonctionnalités

- Marketplace et recherche par catégorie/ville
- Comptes utilisateurs avec JWT
- Publication d'annonces
- Réservation avec calcul du prix et de la caution
- Dashboard utilisateur
- Check-in / check-out vidéo
- Hash SHA-256 des vidéos enregistrées
- Avis liés à une location terminée
- Trust Score de 0 à 100
- Signalements et système de suspension automatique pour les cas répétés/graves
- API REST
- SQLite local
- Interface responsive sans framework frontend

## Installation

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`.

Pour le développement :

```bash
npm run dev
```

## Variables d'environnement

- `PORT` — port HTTP, défaut `3000`
- `JWT_SECRET` — secret de signature JWT. À définir impérativement en production.

## Structure

```text
Locly/
├─ public/
│  ├─ index.html
│  ├─ app.js
│  └─ styles.css
├─ data/             # SQLite créé automatiquement
├─ uploads/          # vidéos locales, ignorées par Git
├─ server.js         # API + serveur web
├─ package.json
└─ .gitignore
```

## Important pour la production

Le MVP stocke les vidéos sur le disque local. Pour une vraie plateforme, remplacer ce stockage par un objet storage (S3/R2/etc.), ajouter antivirus/transcodage, limites de durée, modération, chiffrement, paiement/caution, KYC selon les besoins, notifications, contrôle des droits d'accès aux vidéos, journal d'audit et politique de rétention RGPD.

Le Trust Score est un mécanisme de plateforme et ne constitue pas une décision judiciaire sur la responsabilité d'un dommage. Les suspensions définitives doivent prévoir un processus de contestation et d'examen humain.
