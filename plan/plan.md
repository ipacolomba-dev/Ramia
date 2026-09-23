# ’Ra mia — Iterazione: vetrina standard, AI e logistica

Questo documento descrive cosa verrà aggiunto/cambiato in questa fase. Serve per approvare o correggere le scelte. Le funzioni già presenti (marketplace, carrello, checkout simulato, trattative B2B, richieste logistica, richieste etichette, pannello admin, import PDF, notifiche email, pagina Chi siamo, brand/logo) restano e vengono estese come indicato.

## 1. Il produttore si presenta (profilo azienda)
Ogni produttore avrà una **scheda azienda pubblica** che compila lui stesso:
- Presentazione/bio dell'azienda
- **Certificazioni** (es. BIO, DOP/IGP, HACCP, ISO): elenco con nome, anno facoltativo e logo/immagine facoltativa
- **Premi vinti**: elenco con nome, anno, immagine facoltativa
- **Fiere a cui partecipa**: elenco con nome, luogo/anno
- Altre informazioni utili (zona, contatti, sito, note)

La scheda azienda è visibile ai compratori dalla pagina del prodotto e da un elenco produttori.

## 2. Vetrina prodotti standard (uguale per tutti)
Tutti i prodotti seguono **lo stesso modello**, così la vetrina è coerente. Per ogni prodotto:
- Nome, descrizione, categoria, foto
- **Prezzo al dettaglio** (per i consumatori)
- **Prezzo all'ingrosso** (per grossisti/distributori)
- **Quantità minima ordinabile (MOQ)** all'ingrosso
- **Confezioni per cartone**
- **Cartoni per fila (strato) di pallet**
- **Cartoni per pallet**
- Unità di misura e scorta

Ne consegue una scelta importante (vedi §9): il prodotto diventa l'unico punto in cui si gestiscono sia dettaglio che ingrosso; le attuali "offerte B2B" separate vengono assorbite dentro il prodotto.

## 3. L'AI aiuta il produttore a creare la vetrina
Due percorsi che portano allo **stesso modello standard**:
- **Ho già un catalogo** (PDF, e in più Excel/CSV, o foto/immagini): l'AI legge il file e compila i campi standard, inclusi prezzi e dati di imballo quando presenti.
- **Non ho un catalogo**: l'AI guida il produttore (descrizione a parole e/o foto del prodotto) e propone una bozza compilata nel modello standard.

In entrambi i casi il produttore **rivede e conferma** la bozza prima dell'invio. Nulla va online senza la tua approvazione (§7).

## 4. I compratori trovano i prodotti (manuale + AI)
Consumatori e grossisti possono:
- **Cercare manualmente** (categorie, ricerca testuale) come oggi.
- **Farsi aiutare dall'AI**: descrivono cosa cercano (tipo prodotto, quantità, destinazione, budget) e l'AI propone i prodotti più adatti.
- L'AI **fa risparmiare** incrociando le esigenze del compratore con i dati dei produttori e le spedizioni disponibili: ad esempio suggerisce di **unirsi a una spedizione condivisa** già attiva verso la stessa destinazione, o di raggruppare più produttori vicini, indicando il risparmio stimato sul trasporto.
- In questa fase l'AI **consiglia** (prodotti + modo più conveniente per riceverli); non prenota automaticamente: l'ordine/adesione resta un'azione del compratore.

## 4-bis. Consulente Export AI (assistente specializzato)
Un **assistente esperto** dedicato ai produttori e ai distributori, con cui possono confrontarsi e chiedere aiuto. Copre:
- **Fiscalità** dei vari paesi legata all'export agroalimentare
- **Procedure doganali** (documenti, dazi, codici HS di massima)
- **Approvazione presso enti alimentari esteri** (es. autorità sanitarie/alimentari) e requisiti d'ingresso
- **Etichette**: regole e adeguamenti richiesti nei mercati di destinazione
- **Qualifiche e certificazioni** necessarie per esportare
- Considera inoltre **eventi geopolitici, possibili crisi economiche e tendenze di domanda** dei prodotti

Come funziona:
- È una **chat** raggiungibile dall'area produttore/distributore; si può collegare a un prodotto/etichetta per avere consigli mirati.
- Usa **GPT‑5.4** per il ragionamento esperto e una **ricerca web aggiornata (Perplexity Sonar)** per riflettere regolamenti recenti, eventi geopolitici e condizioni economiche/di mercato in tempo reale, mostrando le **fonti** citate.
- Include sempre un **avviso**: è consulenza informativa e di orientamento, non sostituisce un consulente fiscale/legale né le autorità competenti; le approvazioni finali restano dell'ente e dei laboratori etichette.

Nota: la parte "aggiornata al presente" (geopolitica, crisi, domanda, regolamenti recenti) richiede una **fonte web live**. Senza di essa l'assistente resta comunque utile ma basato sulla sola conoscenza del modello, senza eventi in tempo reale (vedi decisione §9.6).

## 5. Dettaglio vs ingrosso: chi vede cosa- **Consumatori**: vedono il prezzo al dettaglio e comprano al dettaglio.
- **Grossisti/distributori**: vedono prezzo all'ingrosso, MOQ e dati di imballo (cartone/pallet), e possono avviare una **trattativa** con il produttore (come oggi) fino all'accordo.

## 6. Logistica: collaborazione e aggregazione
- Le **aziende di logistica** si candidano a collaborare e indicano il tipo di servizio: **piccoli trasporti** (spedizioni al dettaglio) e/o **grandi trasporti** (spedizioni importanti/centralizzate).
- Resta la **logistica centralizzata**: produttori e compratori possono **aggregarsi** su una stessa spedizione per abbassare i costi; i vettori inviano preventivi a confronto.
- Attenzione alla **qualità in spedizione**: le richieste indicano se serve catena del freddo/isotermico, così i vettori adeguati possono proporsi.

## 7. Cosa approvi tu (owner)
Nulla diventa attivo senza il tuo via libera. Approvi:
- **Ogni catalogo** creato e **ogni singolo prodotto** (dettaglio e ingrosso)
- **Ogni distributore/grossista** che vuole collaborare (l'account resta in attesa finché non lo approvi)
- **Ogni laboratorio etichette** (collaboratore) che vuole operare
- (Restano) i pacchetti curati e la gestione visibilità

Le aziende di logistica: candidatura soggetta ad approvazione come i distributori.

## 8. I tuoi guadagni (vista owner)
Un pannello mostra i ricavi calcolati automaticamente:
- **Pubblicità**: incassi dai pacchetti di visibilità acquistati dai produttori
- **5%** di commissione sulle vendite
- **1%** su trasporto e logistica
- **1%** sulle etichette

Assunzione importante (vedi §9): trattandosi di **checkout simulato**, questo pannello è **un resoconto/contabilità** dei ricavi maturati, non un incasso reale. Diventa incasso reale quando si attivano i pagamenti (Stripe), fase successiva.

## 8-bis. Dati di fatturazione (come vengono gestiti)
Come vengono raccolti, mostrati e conservati i dati fiscali/di fatturazione:
- **Chi li inserisce**: ogni azienda che vende o compra a livello professionale (produttori, distributori/grossisti, laboratori, logistica) compila nel proprio profilo i **dati di fatturazione**: ragione sociale, indirizzo di fatturazione, paese, e identificativo fiscale (**Partita IVA / VAT** per le aziende; per i consumatori privati basta nome, indirizzo ed eventuale codice fiscale).
- **Italia / e-fattura**: per le aziende italiane si raccolgono anche **Codice Destinatario SDI o PEC**, così i dati sono pronti per la fattura elettronica quando i pagamenti saranno reali.
- **Estero (app mondiale)**: i campi si adattano al paese (VAT UE, tax ID extra‑UE); i consumatori privati non hanno obbligo di P.IVA.
- **Dove compaiono**: su ogni ordine e su ogni acquisto di visibilità viene generato un **riepilogo/ricevuta** con i dati di fatturazione della parte e il dettaglio importi (imponibile, eventuale nota su IVA, totale).
- **Chi vende a chi**: ogni produttore vende in proprio; la fattura commerciale del prodotto è un rapporto **produttore → compratore**. Le **commissioni** (5% vendite, 1% logistica, 1% etichette) e la **pubblicità** sono ricavi di ’Ra mia verso produttori/partner: nel pannello guadagni compaiono come importi maturati, pronti per essere fatturati quando si attiva l'incasso reale.
- **Adesso**: con checkout simulato l'app **non emette fatture fiscali valide** e non trasmette nulla al Sistema di Interscambio: genera solo riepiloghi/ricevute e conserva i dati di fatturazione nel profilo. L'emissione reale (fattura elettronica SdI o fatturazione tramite Stripe) è una **fase successiva**, insieme ai pagamenti.
- **Privacy**: i dati di fatturazione sono conservati in modo riservato e usati solo per ordini, ricevute e futura fatturazione.

## 9. Scelte da confermare o correggere
1. **Unificare dettaglio + ingrosso nel prodotto** (le vecchie "offerte B2B" separate spariscono e diventano proprietà del prodotto). In alternativa si potrebbero tenere separati, ma la vetrina sarebbe meno uniforme.
2. **Guadagni come resoconto** finché i pagamenti sono simulati (nessun addebito/pagamento reale ora).
3. **Account distributori, laboratori etichette e logistica in attesa di approvazione**: possono registrarsi ma non operano finché non li approvi.
4. **Motore AI**: si usa **GPT‑5.4** (modello più accurato) sia per leggere i cataloghi in qualsiasi formato sia per il consiglio ai compratori. (Confermato: preferito il modello più accurato.)
5. **Lingue**: l'app resta Italiano + Inglese (già pronta per un pubblico internazionale). Altre lingue si possono aggiungere in seguito.
6. **Consulente Export AI con dati in tempo reale**: per considerare eventi geopolitici, crisi economiche, domanda e regolamenti recenti, l'assistente usa una ricerca web live (**Perplexity Sonar**), che richiede una **API key Perplexity** (console.perplexity.ai). **Default deciso**: si costruisce subito l'assistente con GPT‑5.4 (conoscenza esperta, senza tempo reale) e si predispone l'aggancio a Perplexity; appena fornisci la key, la ricerca live si attiva senza altre modifiche.

## 10. Diffusione mondiale e semplicità
- L'app è pensata per un pubblico internazionale (IT/EN) e la pubblicazione mondiale su App Store/Play Store avviene tramite il flusso di pubblicazione/deploy, quando deciderai di pubblicare.
- Ogni nuova funzione segue lo stile attuale: pochi passaggi, linguaggio chiaro, l'AI che riduce il lavoro manuale sia per i produttori sia per i compratori.

## Fuori ambito (per questa fase)
- Pagamenti reali e pagamenti automatici delle commissioni/payout
- Prenotazione/pagamento automatico delle spedizioni
- Firma digitale legale degli accordi
- Verifica automatica dei documenti (certificazioni/etichette) oltre all'approvazione manuale
