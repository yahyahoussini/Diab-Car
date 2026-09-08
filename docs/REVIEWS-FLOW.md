# Avis clients — la procédure

> Plan §8.4. En **français** : chaque texte de ce document se colle tel quel dans
> WhatsApp ou dans l'admin.
>
> Deux règles, non négociables, qui décident de tout le reste :
>
> 1. **On n'écrit jamais un avis.** Ni pour un client, ni « d'après » un client.
> 2. **On ne récompense jamais un avis.** Pas de remise, pas de plein d'essence,
>    pas de surclassement. C'est interdit par Google, c'est détectable, et la
>    sanction est la suppression de tous les avis de la fiche — les vrais compris.
>
> Ce que l'on fait à la place : demander, au bon moment, à tout le monde, poliment,
> une seule fois.

---

## Pourquoi le lendemain à 10 h

Le système crée automatiquement une tâche **le lendemain du retour, à 10 h**.
Ce n'est pas arbitraire :

- **Pas le jour du retour** : le client est pressé, il rend les clés et part. Une
  demande à ce moment-là passe pour une formalité de comptoir.
- **Pas trois jours après** : la location n'est plus fraîche, le taux de réponse
  s'effondre.
- **10 h** : après le trajet du matin, avant le déjeuner. Un message à 7 h agace ;
  un message à 22 h ne sera jamais lu.
- **Uniquement après un retour effectué** — un client dont la location a été annulée
  ou qui ne s'est jamais présenté ne reçoit rien.

---

## Le déroulé, côté équipe

1. **La tâche apparaît.** Admin → Notifications, et dans « ACTION REQUISE » du
   tableau de bord : « Demander un avis à *prénom* ».
2. **Ouvrir la tâche.** Le message WhatsApp est déjà rédigé, dans la langue du
   client (FR, EN, AR ou ES — celle de sa réservation), avec le lien d'avis Google.
3. **Relire avant d'envoyer.** Deux cas où l'on **n'envoie pas** :
   - la location s'est mal passée (retard, panne, litige de caution) → on appelle,
     on règle le problème, et on ne demande rien ;
   - le client a déjà laissé un avis lors d'une location précédente.
4. **Envoyer.** Un seul message. **Aucune relance.**
5. **Marquer la tâche comme lue.**

---

## Le message

Envoyé depuis le WhatsApp de l'agence (`+212 6 59 77 55 82`), avec le lien court
Google renseigné dans **Paramètres → Agence → Lien d'avis Google**. Tant que ce
champ est vide, la tâche s'affiche mais le bouton WhatsApp reste inactif : il vaut
mieux pas de message qu'un message avec un lien mort.

**Français**
> Bonjour {prénom}, merci d'avoir loué chez Diab Car 🚗
> Si tout s'est bien passé, un avis Google nous aiderait beaucoup — cela prend une minute :
> {lien}
> Bonne route !

**English**
> Hello {first name}, thank you for renting with Diab Car 🚗
> If everything went well, a Google review would help us a lot — it takes a minute:
> {link}
> Safe travels!

**العربية**
> السلام عليكم {الاسم}، شكراً على كرائكم سيارة من ديا ب كار 🚗
> إذا كان كل شيء على ما يرام، تقييمكم على Google سيساعدنا كثيراً — دقيقة واحدة فقط:
> {الرابط}
> طريق السلامة!

**Español**
> Hola {nombre}, gracias por alquilar con Diab Car 🚗
> Si todo ha ido bien, una reseña en Google nos ayudaría mucho — solo un minuto:
> {enlace}
> ¡Buen viaje!

Ce que le message ne fait **pas**, volontairement : il ne demande pas cinq étoiles,
il ne promet rien, et il ne dit pas « si vous avez un problème, contactez-nous
plutôt que de laisser un avis » — cette phrase est un filtrage d'avis négatifs, et
Google la sanctionne.

---

## Importer un nouvel avis dans le site

Les avis Google ne se récupèrent pas automatiquement : l'API Places qui les
expose est payante au-delà d'un quota, et le plan tient à rester sur des services
gratuits (§9). La saisie est donc manuelle, une fois par semaine, et prend deux
minutes.

**Admin → Contenu → Avis → Nouvel avis**

| Champ | Quoi mettre |
|---|---|
| Source | `google` |
| Note | telle quelle, 1 à 5 |
| Auteur | **prénom + initiale** : `Youssef B.` — jamais le nom complet |
| Ville | celle indiquée par le client, sinon vide |
| Véhicule | le modèle loué, s'il est identifiable |
| Langue | celle de l'avis |
| Texte | **copié mot pour mot**, fautes comprises. On ne réécrit pas un client. |
| Publié | coché après relecture |
| Exemple | **jamais coché** pour un vrai avis |

Le prénom + initiale est une décision de minimisation des données (plan §9.4,
loi 09-08 / CNDP) : le nom complet d'un client n'a aucune raison d'être publié.

---

## La case « exemple »

Les avis de démonstration livrés avec le site portent l'indicateur `is_sample`.
**La base de données elle-même refuse de les servir au public** — la règle est
écrite dans la politique RLS de la table `reviews`, pas dans un composant, donc
aucune page ne peut en afficher un par accident.

Conséquence pratique : tant qu'aucun vrai avis n'est saisi, le site n'affiche
aucun avis. C'est voulu. Une section « avis » vide est honnête ; une section
remplie de faux témoignages ne l'est pas.

---

## Répondre aux avis

Sur Google, pas sur le site. Toujours, sous 48 h.

- **Avis positif** — court, personnel, sans copier-coller :
  > Merci {prénom} ! Au plaisir de vous revoir chez Diab Car.
- **Avis négatif** — accuser réception, ne pas se justifier en public, proposer
  un canal privé :
  > Bonjour {prénom}, merci de nous l'avoir signalé et désolé pour ce désagrément.
  > Pouvez-vous nous écrire au +212 6 59 77 55 82 pour que nous regardions votre
  > dossier ? Nous voulons comprendre ce qui s'est passé.

Un avis négatif auquel on répond bien fait plus pour la confiance que dix avis
cinq étoiles sans réponse. Une note de 4,6 avec des réponses est plus crédible
qu'un 5,0 parfait, que les clients lisent comme suspect.

---

## Objectif et rythme

| Étape | Cible |
|---|---|
| Mois 1 | 10 avis réels |
| Mois 3 | 30 avis, note ≥ 4,5 |
| Rythme de croisière | tous les clients dont le retour s'est bien passé, une demande chacun |

Avec ~30 locations par mois et un taux de réponse de 20 %, cela fait environ
6 avis par mois **sans jamais rien demander de plus qu'une fois**.

---

## Ce qui est automatique et ce qui ne l'est pas

| Automatique (le site le fait) | Manuel (vous le faites) |
|---|---|
| Créer la tâche le lendemain du retour à 10 h | Relire et envoyer le message |
| Rédiger le message dans la langue du client | Juger si la location s'est bien passée |
| Y insérer le lien d'avis des Paramètres | Saisir l'avis reçu dans l'admin |
| Empêcher un avis « exemple » d'être publié | Répondre sur Google |
