# Nederlandse Spoorwegen

## Présentation

Cette intégration apporte **NS**, les chemins de fer néerlandais, dans Gladys. Elle donne les **prochains trains en temps réel, avec leur retard et leur voie**, aux gares que vous choisissez (trois dans le formulaire, jusqu’à 10 de plus avec un bouton), filtrés par type de train et direction. Elle suit aussi les **perturbations** de chaque gare : incidents (panne de signalisation, train en panne), travaux et alertes (tempête, grève). Chaque gare devient un appareil à afficher sur un tableau de bord et à utiliser dans les scènes.

Les données viennent de l’**API officielle de NS** (`gateway.apiportal.ns.nl`), avec votre propre clé gratuite. Chaque gare suivie est lue en une requête, toutes les minutes par défaut (toutes les 10 minutes tant qu’aucune gare n’annonce de train dans la demi-heure, la nuit). Les perturbations sont lues toutes les 5 minutes. La liste des gares de NS est gardée par l’intégration et relue une fois par semaine. NS autorise 300 requêtes par 5 minutes et par clé : l’intégration reste toujours en dessous.

NS donne l’**heure estimée** de chaque train : le retard est l’écart avec l’heure prévue. Les **changements de voie** et les **trains supprimés** sont affichés. Les noms de gares, les messages et les perturbations restent en anglais, tels que NS les écrit.

C’est une intégration **cloud** : elle contacte `gateway.apiportal.ns.nl` avec votre clé. Rien d’autre ne quitte votre réseau.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Une clé gratuite de l’API NS : créez un compte sur [apiportal.ns.nl](https://apiportal.ns.nl/), ouvrez **Products**, abonnez-vous à **Ns-App** (gratuit), puis copiez la **clé primaire** affichée dans votre profil.

## Configuration

| Champ             | Quoi saisir                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Clé d’API         | La clé primaire de votre abonnement « Ns-App » (32 caractères).                                                 |
| Gare 1, 2, 3      | Le code de la gare (« UT », « ASD », les codes des écrans NS) ou son nom (« Utrecht Centraal »).                |
| Types de train    | Seulement ces trains : « IC », « SPR », « IC \| ICE ». Vide : tous les trains.                                  |
| Direction         | Seulement les trains qui vont à ces gares ou s’y arrêtent : « Amersfoort \| Zwolle ». Vide : toutes directions. |
| Lecture des gares | Toutes les 30 secondes, minutes, 2 minutes ou 5 minutes.                                                        |
| Langue des textes | Noms des appareils, résumés et sorties des scènes. Les textes de NS restent en anglais.                         |

Le bouton **Chercher une gare** donne les gares contenant quelques mots, avec leur code (« Den Haag Centraal [GVC] »). Un nom fonctionne aussi (« Utrecht », « Den Bosch ») ; quand deux gares le partagent, saisissez le nom complet ou le code. **Tester la connexion** vérifie la clé et lit chaque gare tout de suite.

La **direction** regarde la destination et les gares où le train s’arrête ensuite : « Amersfoort » garde l’Intercity pour Zwolle qui s’arrête à Amersfoort.

Plus de gares que les trois du formulaire (maison, travail, école…) : **Ajouter une gare** prend les trois mêmes champs — gare, types de train, direction — et suit jusqu’à 10 gares de plus. **Lister les gares** montre toutes les gares suivies, numérotées ; **Retirer une gare** prend ce numéro (ou le nom). Les gares ajoutées sont gardées dans la configuration de Gladys et suivent donc ses sauvegardes.

## Utilisation

### Appareils

Dans l’onglet **Découvrir**, créez les appareils voulus, **NS \<gare\>** :

- le prochain train en texte (« IC 3529 → Venlo · 11 min (+8 min de retard) · voie 15 (changée) ») ;
- l’attente du prochain train et du suivant (minutes), et le retard du prochain (minutes) ;
- le trafic en texte (« Trafic perturbé : Utrecht - Amersfoort: fewer trains ») et le nombre de perturbations en cours.

La nuit, sans aucun train, les attentes gardent leur dernière valeur.

### Perturbations

NS publie trois types : les **perturbations** (incidents), les **travaux** (prévus) et les **alertes** (messages nationaux). L’état d’une gare est le plus grave en cours : trafic normal, travaux, trafic perturbé ou très perturbé. Les travaux qui commencent dans les trois jours sont affichés « à venir ».

### Widgets du tableau de bord

![Le widget Départs NS d’Utrecht Centraal et le widget Perturbations NS de deux gares (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-nederlandse-spoorwegen/main/docs/assets/widgets.fr.png)

- **Départs NS** : le tableau des départs d’une gare : une ligne par train, avec son heure prévue, son type, sa destination, son retard (« +8 ») et sa voie. La ligne passe en orange quand le train a 5 minutes de retard ou plus ou change de voie, en rouge quand il est supprimé. Le réglage **Trains affichés** fixe le nombre de lignes. Choisissez une gare suivie, ou saisissez n’importe quelle gare (et des types de train) dans les réglages du widget. Avec **Plusieurs gares**, un même widget montre plusieurs appareils gares.
- **Perturbations NS** : l’état de vos gares, puis les perturbations et travaux en cours et à venir, avec leur période. Touchez une carte pour le texte complet. Avec **Tout le réseau**, les perturbations de tout le réseau néerlandais.

### Scènes

Déclencheurs, une fois par changement (la première lecture ne sert que de référence) :

- **NS : train bientôt au départ** : un train d’une gare suivie part dans 2, 5, 10, 15, 20 ou 30 minutes, compté sur son heure estimée.
- **NS : train supprimé** : un train des deux prochaines heures d’une gare suivie est supprimé.
- **NS : train en retard** : le retard d’un train des deux prochaines heures atteint 5, 10, 15 ou 30 minutes (le palier le plus haut atteint). Cochez 5, 10, 15 et 30 pour tout retard de 5 minutes ou plus.
- **NS : changement de voie** : un train des deux prochaines heures part d’une autre voie.
- **NS : perturbation à une gare** : une perturbation, des travaux ou une alerte concernant une gare suivie commence.
- **NS : fin de perturbation** : elle est terminée.

Chacun donne une phrase toute faite, `{{triggerEvent.data.summary}}`, et ses valeurs (train, destination, heure, voie, retard, titre, cause…). Les actions **NS : prochains trains** et **NS : perturbations d’une gare** renvoient le même genre de valeurs, à mettre dans un message ou à tester dans une condition.

Exemples :

- Quand l’Intercity pour Amersfoort part d’Utrecht Centraal dans 10 minutes → allumer la lampe de l’entrée en vert.
- Quand votre train est supprimé, a 15 minutes de retard ou change de voie → envoyer le résumé sur votre téléphone.
- Chaque jour de semaine à 7 h 30 → lire les prochains trains de votre gare et les faire annoncer par l’enceinte de la cuisine.

### Transport

Cloud uniquement : les données viennent d’Internet. Seules les gares que vous suivez sont demandées à l’API de NS, une par une.

## Dépannage

- **« NS refuse la clé d’API »** : vérifiez que vous avez copié la clé primaire du produit **Ns-App** et que l’abonnement est actif sur apiportal.ns.nl.
- **« Inconnu ou ambigu »** : utilisez **Chercher une gare**, puis copiez le nom exact ou le code.
- **« Trop de requêtes vers NS »** : la clé est partagée avec une autre application, ou trop de gares sont lues toutes les 30 secondes ; choisissez une lecture moins fréquente.
- **Aucun train** : la nuit, le réseau dort ; la gare est lue toutes les 10 minutes.
- **« NS est injoignable »** : l’intégration réessaie à chaque lecture ; les derniers trains restent sur les widgets.
- **Pour signaler un problème** : appuyez sur **Diagnostic**, puis copiez les lignes commençant par « NS diagnostic » de l’onglet Journaux dans une issue GitHub ou une réponse sur le forum, avec les versions de Gladys et de l’intégration. La clé n’y est jamais écrite.
