# Politique de confidentialité

Ceci est une traduction fournie pour votre confort. Seule la [version anglaise](../PRIVACY.md) fait foi.

Version 2 · Dernière mise à jour : 4 novembre 2026

Cette politique explique ce qu'il advient de vos données personnelles lorsque vous utilisez GameMate. Elle est rédigée pour respecter le Règlement général sur la protection des données de l'UE (RGPD), la loi allemande sur la protection des données dans les télécommunications et les services numériques (TDDDG) et la loi sur la protection des données personnelles du Royaume d'Arabie saoudite (PDPL).

## 1. Qui est responsable

**Omar Abulebda**, le fournisseur de GameMate.
E-mail : [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com)

## 2. En bref

- GameMate fonctionne sur votre PC. **Nous ne recevons, ne collectons et ne conservons aucune de vos données.** Il n'y a ni serveur GameMate, ni compte, ni publicité, ni statistiques, ni suivi.
- Tout ce que GameMate conserve reste sur votre PC, dans votre dossier utilisateur Windows.
- GameMate ne se connecte aux services d'autres entreprises que lorsque vous utilisez une fonction qui en a besoin. Les fonctions qui envoient vos données ailleurs (Google Gemini, recherche sur le web, recherches en ligne, recherche des wikis de vos jeux) sont **désactivées jusqu'à ce que vous les activiez**, et vous pouvez les désactiver à tout moment.
- **Supprimer mes données** dans **Paramètres → Confidentialité et mentions légales** efface tout ce que GameMate a enregistré sur votre PC.

## 3. Ce que GameMate conserve sur votre PC

GameMate enregistre les éléments suivants dans son dossier de votre profil utilisateur Windows, lisible uniquement par votre compte Windows. Cet enregistrement est nécessaire pour fournir les fonctions que vous utilisez (§ 25 (2) n° 2 TDDDG).

| Quoi                                                                                                                                | Pourquoi                                                    | Combien de temps                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Vos paramètres, y compris la date à laquelle vous avez accepté ces documents et donné chaque consentement                           | Pour retenir vos choix, et comme trace de vos consentements | Jusqu'à ce que vous les modifiiez ou supprimiez vos données                                   |
| Votre clé API Gemini, si vous en ajoutez une, chiffrée par Windows                                                                  | Pour utiliser Gemini                                        | Jusqu'à ce que vous la retiriez, retiriez votre consentement Gemini ou supprimiez vos données |
| Les modèles d'IA, le moteur d'IA de GameMate, les modèles vocaux et les voix que vous avez téléchargés                              | Pour faire fonctionner l'IA sur votre PC                    | Jusqu'à ce que vous les retiriez ou supprimiez vos données                                    |
| Les jeux trouvés ou ajoutés : nom, dossier ou programme, adresse du wiki                                                            | Pour vous aider avec le jeu auquel vous jouez               | Jusqu'à ce que vous retiriez ce consentement ou supprimiez vos données                        |
| Un journal de ce que GameMate a fait (par exemple démarrer l'IA ou rechercher des mises à jour), sans vos questions ni vos réponses | Pour trouver et corriger les problèmes                      | Environ 1 Mo, les entrées les plus anciennes sont écrasées ; supprimé avec vos données        |

Vos conversations, captures d'écran, enregistrements vocaux et ce que le compagnon a remarqué sont **conservés uniquement en mémoire** et disparaissent lorsque vous fermez la discussion, désactivez le compagnon ou quittez GameMate. Les captures d'écran et les enregistrements vocaux ne sont jamais enregistrés sur le disque.

## 4. Ce que GameMate fait sur votre PC

- **Votre écran** n'est capturé que lorsque vous envoyez une question avec une capture d'écran, appuyez sur le raccourci en jeu avec les captures activées, ou pendant que le compagnon est réglé pour observer votre jeu. Vous le choisissez dans l'application ; le compagnon est désactivé par défaut.
- **Votre microphone** n'est utilisé que lorsque la saisie vocale est activée et que vous appuyez sur le raccourci vocal ou sur 🎤. Votre parole est transformée en texte sur votre PC.
- **Le modèle d'IA** qui fonctionne sur votre PC (le moteur de GameMate, ou Ollama si vous l'utilisez) reçoit vos questions et captures d'écran uniquement sur votre PC.

## 5. Fonctions facultatives qui nécessitent votre consentement

Ces fonctions sont désactivées jusqu'à ce que vous les activiez. En activer une vaut consentement à ce qui est décrit ici (art. 6 (1) (a) RGPD, § 25 (1) TDDDG, PDPL). Vous pouvez retirer chaque consentement à tout moment en désactivant la fonction ; cela arrête la fonction et n'affecte pas ce qui a été fait auparavant.

### Trouver vos jeux (Paramètres → Jeux)

GameMate lit les listes de jeux de Steam, Epic Games, Battle.net et Riot sur votre PC, vos dossiers de modpacks CurseForge et le nom du programme au premier plan. Cela reste sur votre PC. Pour trouver le wiki de chaque jeu, **seul le nom du jeu** est envoyé à wiki.gg et Fandom. Retirer ce consentement supprime aussi la liste des jeux trouvés par GameMate.

### Recherches en ligne (Paramètres → IA et en ligne)

Lorsqu'une question porte sur un élément d'un jeu, GameMate envoie **le sujet** (par exemple « Ender Dragon ») au wiki de ce jeu (comme minecraft.wiki, un wiki Fandom ou un wiki wiki.gg) et, pour les mods Minecraft, le nom du mod à Modrinth, puis télécharge le texte de la page et les images qu'il vous montre. Votre question elle-même n'est pas envoyée.

### Recherche sur le web (Paramètres → IA et en ligne)

Disponible uniquement lorsque Gemini est activé. Pour les questions sur l'actualité (la méta, les correctifs, les saisons) ou sur ce que recommandent les joueurs, et lorsque le wiki n'a pas de réponse, GameMate ou l'IA forme une courte **requête de recherche** à partir des mots-clés de votre question et du nom du jeu (par exemple « Overwatch characters currently meta »), et GameMate envoie seulement cette requête à Google via l'API Gemini avec votre clé API. Votre conversation, vos captures d'écran et vos autres questions ne sont pas envoyées avec elle. Google cherche sur le web (y compris dans des forums comme Reddit) et renvoie un résumé, les pages utilisées et ses suggestions de recherche, que GameMate affiche avec la réponse. Google traite la requête selon les conditions de l'API Gemini et ses règles de confidentialité (voir Google Gemini ci-dessous). Les recherches sont décomptées du quota gratuit Google Search de votre clé API ; si la facturation est activée pour votre clé, Google peut facturer les recherches au-delà.

### Google Gemini (Paramètres → IA et en ligne)

Si vous choisissez Gemini pour les réponses ou pour le compagnon, GameMate envoie à Google : vos questions, la conversation jusque-là, les captures d'écran que vous joignez ou que le compagnon prend, ce que le compagnon a remarqué récemment, et votre clé API. Google traite ces données selon les [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) et les [Règles de confidentialité de Google](https://policies.google.com/privacy), en tant que responsable de traitement distinct. Selon votre compte Google, Google peut utiliser ces données pour améliorer ses services. Google exige que vous ayez au moins 18 ans.

## 6. Connexions qui ne sont pas des consentements facultatifs

- **Les téléchargements que vous lancez** (modèles d'IA, modèles vocaux et la voix naturelle depuis Hugging Face, le moteur d'IA de GameMate depuis GitHub) se connectent à ces services lorsque vous cliquez sur **Télécharger**, parce que vous les avez demandés (art. 6 (1) (b) RGPD).
- **La recherche de mises à jour** demande à GitHub la dernière version de GameMate, peu après le démarrage puis toutes les quelques heures, et télécharge une nouvelle version s'il y en a une. Nous le faisons pour fournir des correctifs de sécurité et des améliorations (notre intérêt légitime, art. 6 (1) (f) RGPD). Vous pouvez la désactiver dans **Paramètres → Général**. GameMate ne recherche aucune mise à jour avant que vous ayez accepté les Conditions d'utilisation.

Comme toute connexion sur internet, ces requêtes montrent au service votre adresse IP et des informations techniques de base (comme le nom et la version de l'application). Nous ne recevons jamais ces informations.

## 7. Qui reçoit des données

Uniquement les services que vous utilisez via GameMate, chacun en tant que responsable de traitement distinct selon sa propre politique de confidentialité : Google (Gemini), les wikis de jeux que vous consultez (par exemple Fandom, wiki.gg, minecraft.wiki), Modrinth, Hugging Face et GitHub (qui appartient à Microsoft). Nous ne vendons ni ne partageons vos données avec qui que ce soit, car nous ne les avons jamais.

## 8. Transferts vers d'autres pays

Certains de ces services sont établis, ou traitent des données, aux États-Unis ou dans d'autres pays situés hors de l'UE et hors d'Arabie saoudite. Les données ne leur parviennent que lorsque vous utilisez la fonction qui s'y connecte. Pour les transferts depuis l'UE, ces entreprises s'appuient sur des garanties prévues par le RGPD, comme le EU-US Data Privacy Framework ou des clauses contractuelles types. Si vous vivez en Arabie saoudite, utiliser ces fonctions signifie que vos données sont transférées hors du Royaume à votre demande.

## 9. Vos droits

En vertu du RGPD, vous avez le droit d'accéder à vos données (art. 15), de les faire rectifier (art. 16), de les faire effacer (art. 17), d'en limiter le traitement (art. 18), de les recevoir dans un format portable (art. 20), de vous opposer à un traitement fondé sur des intérêts légitimes (art. 21) et de retirer tout consentement à tout moment (art. 7 (3)). En vertu de la PDPL, vous avez le droit d'être informé, d'accéder à vos données et d'en obtenir une copie, de les faire corriger, compléter ou mettre à jour, de les faire détruire, et de retirer votre consentement.

Comme tout ce que GameMate conserve se trouve sur votre propre PC, vous pouvez exercer la plupart de ces droits directement dans GameMate : voir et modifier vos choix dans les Paramètres, désactiver les fonctions facultatives et utiliser **Supprimer mes données**. Pour les données détenues par Google, les wikis, Hugging Face ou GitHub, contactez ces services. Pour toute autre question, écrivez-nous à [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com).

## 10. Réclamations

Vous pouvez déposer une réclamation auprès d'une autorité de protection des données, en particulier celle du lieu où vous vivez ou travaillez :

- **Dans l'UE :** votre autorité nationale de protection des données ([liste des autorités de l'UE](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en)). En Allemagne, il s'agit de l'autorité de protection des données de votre Land.
- **En Arabie saoudite :** la Saudi Data & AI Authority (SDAIA), qui supervise la PDPL ([sdaia.gov.sa](https://sdaia.gov.sa)).

## 11. Enfants

GameMate est destiné aux personnes de 16 ans et plus, ou plus jeunes avec la permission d'un parent ou d'un tuteur légal. Gemini est réservé aux personnes de 18 ans et plus, comme Google l'exige.

## 12. Aucune décision automatisée

GameMate ne prend aucune décision à votre sujet produisant des effets juridiques ou des effets significatifs similaires. L'IA ne fait que répondre à vos questions.

## 13. Modifications de cette politique

Si nous modifions cette politique, la nouvelle version arrive avec une mise à jour de GameMate, et GameMate vous la montre avant que vous continuiez. Vous pouvez toujours lire la version en vigueur dans **Paramètres → Confidentialité et mentions légales**.

## 14. Traductions

Cette politique est aussi disponible dans d'autres langues dans GameMate. Les traductions sont fournies pour votre confort. Si une traduction diffère de la version anglaise, la version anglaise prévaut.
