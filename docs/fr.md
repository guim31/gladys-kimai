# Kimai

Le suivi du temps de votre [Kimai](https://www.kimai.org) dans Gladys : le
chrono en cours, les heures du jour, de la semaine et du mois. Une scène
démarre un chrono quand vous vous asseyez au bureau ou arrivez au travail,
l'arrête quand vous partez, et vous prévient quand vous avez assez travaillé
pour aujourd'hui ; un appui sur le tableau de bord arrête le chrono ou change
de projet.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre un
> vrai serveur Kimai (image Docker `kimai/kimai2:apache` 2.70.2 avec MariaDB,
> octobre 2026), pas encore à l'usage quotidien, ni contre Kimai Cloud. Si
> quelque chose ne marche pas comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-kimai/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un **Kimai 2**, auto-hébergé et joignable depuis Gladys (l'image Docker
  écoute sur le port 8001), ou un compte **Kimai Cloud**.
- Un **jeton d'API** de l'utilisateur Kimai dont vous suivez le temps. Dans
  Kimai : votre avatar (en haut à droite) → **Modifier** → **Accès API** →
  **Créer**, donnez-lui un nom (`Gladys`). Copiez le jeton : Kimai ne
  l'affiche qu'une fois.

  Avant Kimai 2.14, il n'y avait pas de jetons d'API, seulement un **mot de
  passe d'API** (même écran). Il marche encore : remplissez le champ
  **Utilisateur**, et mettez le mot de passe d'API dans le champ du jeton.
  Kimai déclare cette méthode obsolète.

L'intégration voit les saisies de temps, projets et activités de cet
utilisateur, et démarre et arrête les chronos **en son nom**. Un simple
utilisateur (sans rôle d'administrateur) suffit.

## Installation

1. Dans Gladys, **Intégrations** → installez **Kimai**.
2. Dans l'écran **Configuration**, remplissez :
   - **Adresse** : l'adresse de Kimai, par exemple
     `http://192.168.1.20:8001`, `https://kimai.example.org` derrière un
     reverse proxy (un préfixe comme `/kimai` est gardé), ou
     `acme.kimai.cloud`. L'adresse copiée depuis le navigateur marche aussi ;
   - **Jeton d'API**.
3. Options :
   - **Limite du jour, en heures** : au-delà, le déclencheur **Limite du jour
     Kimai atteinte** part, une fois par jour : `8`, `7.5`, `7,5` ou `7:30`.
     8 heures par défaut ; vide : inactif ;
   - **Accepter les certificats auto-signés** : pour une adresse en
     `https://` au certificat auto-signé, sur votre propre serveur seulement ;
   - **Intervalle de rafraîchissement** : de 30 secondes à 5 minutes
     (1 minute par défaut) : le délai avant qu'un chrono démarré ou arrêté
     dans Kimai se voie dans Gladys. Les durées avancent chaque minute quel
     que soit l'intervalle ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout de l'appareil (français par défaut), et les
     textes envoyés aux scènes.
4. Enregistrez, puis **Tester la connexion** : l'intégration lit Kimai et
   donne sa version, l'utilisateur et les heures du jour.
5. Dans l'onglet **Découverte**, ajoutez l'appareil **Kimai _utilisateur_**.

## Appareils

Un appareil, **Kimai _utilisateur_** (l'alias de l'utilisateur dans Kimai,
ou son identifiant), avec six fonctionnalités :

| Fonctionnalité         | Ce qu'elle indique                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Chrono en cours`      | allumé tant qu'un chrono tourne. Un interrupteur : éteint arrête le chrono, allumé reprend la dernière saisie |
| `Projet en cours`      | `Projet · Activité` du chrono en cours ; `Aucun chrono` sinon                                                 |
| `Durée du chrono`      | minutes depuis le démarrage du chrono en cours ; 0 sinon                                                      |
| `Heures aujourd'hui`   | heures des saisies commencées aujourd'hui, chrono en cours compris                                            |
| `Heures cette semaine` | de même, depuis le premier jour de la semaine (lundi, ou dimanche si le profil Kimai le dit)                  |
| `Heures ce mois-ci`    | de même, depuis le premier jour du mois                                                                       |

« Aujourd'hui » est le jour dans le fuseau horaire de Gladys. Une saisie
compte pour le jour où elle **commence**, comme dans les rapports de Kimai :
une saisie de 23 h à 1 h appartient au premier jour. Les pauses sont
déduites, comme dans Kimai.

« Reprendre la dernière saisie » démarre un nouveau chrono sur le projet,
l'activité et la description de la dernière saisie arrêtée, comme le bouton
« redémarrer » de Kimai.

## Tableau de bord

Le widget **Chrono Kimai** montre deux tuiles (aujourd'hui, cette semaine ;
la première en orange au-delà de la limite du jour), le chrono en cours avec
sa durée, et jusqu'à quatre boutons : **Arrêter** quand un chrono tourne,
**Reprendre** sinon, puis les trois derniers couples projet/activité : un
appui passe tout de suite sur ce projet (le chrono en cours est arrêté).

Les fonctionnalités peuvent aussi aller sur le tableau de bord comme celles
de tout appareil : l'interrupteur `Chrono en cours` y fait alors un bouton
marche/arrêt.

## Scènes

### Déclencheurs

- **Chrono Kimai démarré** : un chrono a démarré, depuis Gladys,
  l'application web de Kimai, l'application mobile ou ailleurs.
- **Chrono Kimai arrêté** : un chrono s'est arrêté, avec sa durée.
- **Limite du jour Kimai atteinte** : les heures du jour ont dépassé la
  **Limite du jour** de la configuration. Une fois par jour, avec une minute
  de retard au plus, même pendant que le chrono tourne.

Filtres, pour les deux premiers : le nom du projet et le nom de l'activité
(noms exacts ; vide : tous). Informations transmises aux actions : le numéro
de la saisie, le projet, l'activité, le client, la description, et la durée
en minutes pour un chrono arrêté. Pour la limite : les heures du jour, la
limite, si un chrono tourne et son projet.

Kimai est lu toutes les 30 secondes à 5 minutes : un chrono démarré ou arrêté
dans Kimai lance son déclencheur dans ce délai (aussitôt quand il vient de
Gladys). Un chrono démarré et arrêté entre deux lectures ne lance rien. Un
redémarrage de l'intégration ne lance rien deux fois, et un chrono arrêté
pendant qu'elle était coupée lance son déclencheur à la reprise.

### Actions

- **Démarrer un chrono Kimai** : le **projet** et l'**activité** par leur nom
  (majuscules et accents ignorés) ou leur numéro, et une description
  facultative. L'activité est une activité du projet ou une activité
  globale. **Arrêter le chrono en cours** : coché, un chrono en cours est
  d'abord arrêté ; décoché, un chrono en cours est gardé et rien ne démarre
  (Kimai n'autorise qu'un chrono à la fois par défaut ; s'il en autorise
  plusieurs, le nouveau démarre à côté). Résultats : le numéro de la saisie,
  le projet, l'activité.
- **Arrêter le chrono Kimai** : arrête le chrono en cours, s'il y en a un
  (pas d'erreur s'il n'y en a pas). Résultats : le nombre de chronos
  arrêtés, la durée en minutes, le projet, l'activité.
- **Basculer le chrono Kimai** : arrête le chrono en cours ; s'il n'y en a
  pas, démarre le projet et l'activité indiqués, ou reprend la dernière
  saisie s'ils sont vides. Résultats : si un chrono tourne après coup, la
  durée de celui qui a été arrêté, le projet, l'activité.

Les champs acceptent les variables de scène.

### Idées de scènes

- Un bouton sur le bureau lance **Basculer le chrono Kimai** : un appui pour
  commencer la journée, un pour l'arrêter.
- Quand le téléphone arrive au bureau, **Démarrer un chrono Kimai** sur
  `Bureau` / `Développement`, avec **Arrêter le chrono en cours** coché ;
  quand il part, **Arrêter le chrono Kimai**.
- **Limite du jour Kimai atteinte** : baisser la lampe du bureau et envoyer
  « Assez pour aujourd'hui : {{triggerEvent.data.hours_today}} h » sur
  Telegram.
- Quand l'ordinateur s'éteint (un appareil ping), **Arrêter le chrono
  Kimai**.

## Dépannage

- **« Kimai ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys (`http://<adresse>:8001` ouvre Kimai dans un navigateur).
- **« Jeton d'API refusé »** : le jeton a été supprimé, a expiré ou est mal
  recopié. Avec l'ancien mot de passe d'API, vérifiez aussi l'**Utilisateur** ;
  avec un jeton d'API, laissez **Utilisateur** vide.
- **« Aucune API Kimai à cette adresse »** : l'adresse répond, mais pas avec
  l'API de Kimai : vérifiez le port, ou le préfixe derrière un reverse proxy.
- **« L'adresse redirige »** : saisissez l'adresse en `https://`.
- **« Aucun projet visible ne porte ce nom ou ce numéro »** : le projet est
  masqué, d'un client masqué, ou l'utilisateur n'est pas dans l'équipe qui le
  voit.
- **« Un chrono tourne déjà »** : cochez **Arrêter le chrono en cours** dans
  l'action, ou utilisez **Basculer le chrono Kimai**.
- **Les heures diffèrent de l'écran de Kimai** : Gladys compte le jour dans
  son fuseau horaire, Kimai dans celui du profil de l'utilisateur : réglez le
  même.
- Logs : `LOG_LEVEL=debug` sur le conteneur montre chaque lecture.

## Limites

- Un utilisateur par intégration : celui du jeton. Suivre plusieurs
  utilisateurs demanderait une intégration Gladys chacun (impossible
  aujourd'hui), ou un jeton d'administrateur (non pris en charge).
- Kimai est lu toutes les 30 secondes à 5 minutes, deux requêtes par lecture
  (les chronos en cours, les saisies depuis le début du mois ou de la
  semaine, 250 par page, jusqu'à 10 pages), plus les projets, activités et
  clients toutes les 30 minutes. Les webhooks de Kimai (un plugin) ne sont
  pas utilisés.
- L'intégration démarre et arrête des chronos, et reprend la dernière
  saisie ; elle ne modifie, ne supprime ni n'exporte de saisies, et ignore
  étiquettes, tarifs et budgets.
- Testée avec Kimai 2.70.2. Les versions 2.x antérieures devraient marcher,
  mais n'ont pas été testées, pas plus que Kimai Cloud. Kimai 1 n'est pas
  pris en charge.
- Gladys ne garde aucune donnée de Kimai hors de `/data/kimai-state.json`
  (les chronos vus en dernier et le jour du dernier dépassement de la limite,
  pour qu'aucun événement ne parte deux fois).
- Développée sans un Kimai d'usage quotidien : vos retours sont les
  bienvenus.
- Sans lien avec Kimai.
