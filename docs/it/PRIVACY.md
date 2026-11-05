# Informativa sulla privacy

Questa è una traduzione per tua comodità. Fa fede la [versione inglese](../PRIVACY.md).

Versione 2 · Ultimo aggiornamento: 4 novembre 2026

Questa informativa spiega che cosa succede ai tuoi dati personali quando usi GameMate. È scritta per rispettare il Regolamento generale sulla protezione dei dati dell'UE (GDPR), la legge tedesca sulla protezione dei dati nelle telecomunicazioni e nei servizi digitali (TDDDG) e la Legge sulla protezione dei dati personali del Regno dell'Arabia Saudita (PDPL).

## 1. Chi è il titolare

**Omar Abulebda**, il fornitore di GameMate.
E-mail: [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com)

## 2. In breve

- GameMate funziona sul tuo PC. **Non riceviamo, raccogliamo né conserviamo nessuno dei tuoi dati.** Non ci sono server di GameMate, account, pubblicità, statistiche né tracciamento.
- Tutto ciò che GameMate conserva resta sul tuo PC, nella tua cartella utente di Windows.
- GameMate si collega ai servizi di altre aziende solo quando usi una funzione che ne ha bisogno. Le funzioni che inviano i tuoi dati altrove (Google Gemini, ricerca sul web, ricerche online, ricerca delle wiki dei tuoi giochi) sono **disattivate finché non le attivi**, e puoi disattivarle in qualsiasi momento. Puoi attivarle nella schermata che GameMate mostra dopo che hai accettato i Condizioni d'uso, oppure più tardi in **Impostazioni**.
- **Cancella i miei dati** in **Impostazioni → Privacy e note legali** rimuove tutto ciò che GameMate ha salvato sul tuo PC.

## 3. Che cosa conserva GameMate sul tuo PC

GameMate salva quanto segue nella sua cartella del tuo profilo utente di Windows, leggibile solo dal tuo account Windows. Salvarlo è necessario per fornire le funzioni che usi (§ 25 (2) n. 2 TDDDG).

| Cosa                                                                                                                             | Perché                                                        | Per quanto tempo                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Le tue impostazioni, compreso quando hai accettato questi documenti e dato ciascun consenso                                      | Per ricordare le tue scelte e come registro dei tuoi consensi | Finché non le modifichi o cancelli i tuoi dati                                   |
| La tua chiave API di Gemini, se ne aggiungi una, cifrata da Windows                                                              | Per usare Gemini                                              | Finché non la rimuovi, revochi il consenso a Gemini o cancelli i tuoi dati       |
| Modelli di IA, il motore di IA di GameMate, modelli vocali e voci che hai scaricato                                              | Per eseguire l'IA sul tuo PC                                  | Finché non li rimuovi o cancelli i tuoi dati                                     |
| Giochi trovati o aggiunti: nome, cartella o programma, indirizzo della wiki                                                      | Per aiutarti con il gioco a cui stai giocando                 | Finché non revochi quel consenso o cancelli i tuoi dati                          |
| Un registro di ciò che GameMate ha fatto (per esempio avviare l'IA o cercare aggiornamenti), senza le tue domande né le risposte | Per trovare e correggere i problemi                           | Circa 1 MB; le voci più vecchie vengono sovrascritte; cancellato con i tuoi dati |

Le tue conversazioni, gli screenshot, le registrazioni vocali e ciò che il compagno ha notato sono **conservati solo in memoria** e spariscono quando chiudi la chat, spegni il compagno o esci da GameMate. Screenshot e registrazioni vocali non vengono mai salvati su disco.

## 4. Che cosa fa GameMate sul tuo PC

- **Il tuo schermo** viene catturato solo quando invii una domanda con uno screenshot, premi la scorciatoia di gioco con gli screenshot attivati, o mentre il compagno è impostato per osservare il tuo gioco. Lo scegli tu nell'app; il compagno è disattivato all'inizio.
- **Il tuo microfono** viene usato solo mentre l'input vocale è attivo e premi la scorciatoia vocale o 🎤. La tua voce viene trasformata in testo sul tuo PC.
- **Il modello di IA** che funziona sul tuo PC (il motore di GameMate, oppure Ollama se lo usi) riceve le tue domande e i tuoi screenshot solo sul tuo PC.

## 5. Funzioni facoltative che richiedono il tuo consenso

Queste funzioni sono disattivate finché non le attivi. Attivarne una equivale al tuo consenso a quanto descritto qui (art. 6 (1) (a) GDPR, § 25 (1) TDDDG, PDPL). Puoi revocare ogni consenso in qualsiasi momento disattivando la funzione; questo interrompe la funzione e non incide su quanto fatto in precedenza. Puoi anche attivarle nella schermata che GameMate mostra dopo che hai accettato i Condizioni d'uso.

### Trovare i tuoi giochi (Impostazioni → Giochi)

GameMate legge gli elenchi dei giochi di Steam, Epic Games, Battle.net e Riot sul tuo PC, le tue cartelle dei modpack di CurseForge e il nome del programma in primo piano. Tutto questo resta sul tuo PC. Per trovare la wiki di ogni gioco, **viene inviato solo il nome del gioco** a wiki.gg e Fandom. Revocare questo consenso cancella anche l'elenco dei giochi trovati da GameMate.

### Ricerche online (Impostazioni → IA e online)

Quando una domanda riguarda qualcosa in un gioco, GameMate invia **l'argomento** (per esempio "Ender Dragon") alla wiki di quel gioco (come minecraft.wiki, una wiki di Fandom o una wiki di wiki.gg) e, per le mod di Minecraft, il nome della mod a Modrinth, e scarica il testo della pagina e le immagini che ti mostra. La tua domanda in sé non viene inviata.

### Ricerca sul web (Impostazioni → IA e online)

Disponibile solo mentre Gemini è attivo. Per domande su ciò che è attuale (il meta, le patch, le stagioni) o su ciò che consigliano i giocatori, e quando la wiki non ha una risposta, GameMate o l'IA crea una breve **query di ricerca** con le parole chiave della tua domanda e il nome del gioco (per esempio "Overwatch characters currently meta"), e GameMate invia solo quella query a Google tramite l'API di Gemini con la tua chiave API. La tua conversazione, gli screenshot e le altre domande non vengono inviati insieme. Google cerca sul web (anche nei forum come Reddit) e restituisce un riassunto, le pagine usate e i suoi suggerimenti di ricerca, che GameMate mostra con la risposta. Google tratta la query secondo i termini dell'API di Gemini e le sue norme sulla privacy (vedi Google Gemini più sotto). Le ricerche rientrano nella quota gratuita di Google Search della tua chiave API; se per la tua chiave è attiva la fatturazione, Google può addebitare le ricerche oltre la quota.

### Google Gemini (Impostazioni → IA e online)

Se scegli Gemini per le risposte o per il compagno, GameMate invia a Google: le tue domande, la conversazione fino a quel momento, gli screenshot che alleghi o che il compagno cattura, ciò che il compagno ha notato di recente e la tua chiave API. Google tratta questi dati secondo i [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) e le [Norme sulla privacy di Google](https://policies.google.com/privacy), come titolare autonomo. A seconda del tuo account Google, Google può usare questi dati per migliorare i propri servizi. Google richiede che tu abbia almeno 18 anni.

## 6. Connessioni che non sono consensi facoltativi

- **I download che avvii** (modelli di IA, modelli vocali e la voce naturale da Hugging Face, il motore di IA di GameMate da GitHub) si collegano a questi servizi quando fai clic su **Scarica**, perché li hai richiesti tu (art. 6 (1) (b) GDPR). Anche selezionare un download in quella schermata e fare clic su **Continua** lo avvia.
- **La ricerca degli aggiornamenti** chiede a GitHub l'ultima versione di GameMate, poco dopo l'avvio e ogni qualche ora, e scarica una nuova versione se c'è. Lo facciamo per fornire correzioni di sicurezza e miglioramenti (nostro legittimo interesse, art. 6 (1) (f) GDPR). Puoi disattivarla in **Impostazioni → Generali**. GameMate non cerca aggiornamenti prima che tu abbia accettato le Condizioni d'uso.

Come ogni connessione su internet, queste richieste mostrano al servizio il tuo indirizzo IP e informazioni tecniche di base (come il nome e la versione dell'app). Noi non riceviamo mai queste informazioni.

## 7. Chi riceve i dati

Solo i servizi che usi tramite GameMate, ciascuno come titolare autonomo secondo la propria informativa sulla privacy: Google (Gemini), le wiki dei giochi che consulti (per esempio Fandom, wiki.gg, minecraft.wiki), Modrinth, Hugging Face e GitHub (che appartiene a Microsoft). Non vendiamo né condividiamo i tuoi dati con nessuno, perché non li abbiamo mai.

## 8. Trasferimenti verso altri paesi

Alcuni di questi servizi hanno sede, o trattano dati, negli Stati Uniti o in altri paesi al di fuori dell'UE e dell'Arabia Saudita. I dati li raggiungono solo quando usi la funzione che si collega a loro. Per i trasferimenti dall'UE, queste aziende si basano su garanzie previste dal GDPR, come l'EU-US Data Privacy Framework o le clausole contrattuali tipo. Se vivi in Arabia Saudita, usare queste funzioni significa che i tuoi dati vengono trasferiti fuori dal Regno su tua richiesta.

## 9. I tuoi diritti

In base al GDPR hai il diritto di accedere ai tuoi dati (art. 15), di rettificarli (art. 16), di farli cancellare (art. 17), di limitarne il trattamento (art. 18), di riceverli in un formato portabile (art. 20), di opporti al trattamento basato su interessi legittimi (art. 21) e di revocare qualsiasi consenso in qualsiasi momento (art. 7 (3)). In base alla PDPL hai il diritto di essere informato, di accedere ai tuoi dati e ottenerne una copia, di farli correggere, completare o aggiornare, di farli distruggere e di revocare il tuo consenso.

Poiché tutto ciò che GameMate conserva si trova sul tuo PC, puoi esercitare la maggior parte di questi diritti direttamente in GameMate: vedere e modificare le tue scelte nelle Impostazioni, disattivare le funzioni facoltative e usare **Cancella i miei dati**. Per i dati detenuti da Google, dalle wiki, da Hugging Face o da GitHub, contatta questi servizi. Per tutto il resto, scrivici a [TSCKey1@outlook.com](mailto:TSCKey1@outlook.com).

## 10. Reclami

Puoi presentare un reclamo a un'autorità di protezione dei dati, in particolare a quella del luogo in cui vivi o lavori:

- **Nell'UE:** la tua autorità nazionale di protezione dei dati ([elenco delle autorità dell'UE](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en)). In Germania è l'autorità di protezione dei dati del tuo Land.
- **In Arabia Saudita:** la Saudi Data & AI Authority (SDAIA), che vigila sulla PDPL ([sdaia.gov.sa](https://sdaia.gov.sa)).

## 11. Minori

GameMate è pensato per persone dai 16 anni in su, o più giovani con il permesso di un genitore o di un tutore legale. Gemini è solo per persone dai 18 anni in su, come richiede Google.

## 12. Nessuna decisione automatizzata

GameMate non prende decisioni su di te che producano effetti giuridici o effetti analogamente significativi. L'IA risponde solo alle tue domande.

## 13. Modifiche a questa informativa

Se modifichiamo questa informativa, la nuova versione arriva con un aggiornamento di GameMate, e GameMate te la mostra prima che tu continui. Puoi sempre leggere la versione in vigore in **Impostazioni → Privacy e note legali**.

## 14. Traduzioni

Questa informativa è disponibile in GameMate anche in altre lingue. Le traduzioni sono per tua comodità. Se una traduzione differisce dalla versione inglese, prevale la versione inglese.
