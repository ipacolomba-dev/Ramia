# PRD — ’Ra mia (Mediazione agroalimentare)

## Problem statement
App mobile (Expo/React Native + FastAPI + MongoDB) per la compravendita di prodotti agroalimentari siciliani, per promuovere la dieta mediterranea. Connette produttori e consumatori (B2C), abilita trattative B2B con grossisti/distributori, centralizza la logistica per abbassare i costi di spedizione, offre pacchetti visibilità a pagamento ai produttori, import cataloghi via AI con approvazione admin, e controllo/adeguamento etichette. Brand: "’Ra mia". Lingue: IT + EN.

## Architettura
- Backend `/app/backend`: FastAPI + Motor (MongoDB async), JWT RBAC. Router: auth, market, b2b, logistics, admin, uploads, imports, **profiles**, **advisor**. AI via emergentintegrations (GPT-5.4 testo, Gemini per PDF). Email via Resend managed. Object storage Emergent per immagini. Perplexity Sonar predisposto (chiave `PERPLEXITY_API_KEY` vuota → fallback GPT-5.4).
- Frontend `/app/frontend`: Expo Router file-based, react-query, i18n context, theme tokens in `src/theme.ts`.

## Personas
Consumatore, Produttore, Business (grossista/distributore/GDO), Collaboratore etichette, Azienda di logistica, Admin/Owner (curatore).

## Core requirements (statici)
- Marketplace B2C con checkout simulato + pacchetti curati.
- Prodotto standard con dettaglio + ingrosso (prezzo ingrosso, MOQ, conf/cartone, cartoni/strato, cartoni/pallet).
- Trattative B2B (offerte + negoziazione + accordo).
- Logistica centralizzata condivisa con preventivi, catena del freddo, tipo trasporto.
- Scheda azienda pubblica (bio, certificazioni, premi, fiere, contatti) + dati fatturazione.
- Consulente Export AI (GPT-5.4 + Perplexity ready) con fonti e disclaimer.
- Ricerca AI acquisti (match prodotti + risparmio via spedizioni condivise).
- Import catalogo PDF via AI + bozza prodotto AI da descrizione.
- Pacchetti visibilità produttori (checkout simulato).
- Approvazione owner: prodotti, account business/collaboratore/logistica, pacchetti.
- Pannello guadagni owner (pubblicità + 5% vendite + 1% logistica + 1% etichette) come resoconto.
- i18n IT/EN, brand '’Ra mia', tema bordeaux/oro.

## Implementato (2026-06)
### Registrazione multi-ruolo — Fase 1 (2026-06, questa iterazione)
- Schermata iniziale professionale `/auth/register`: titolo "Entra nel marketplace agroalimentare siciliano" + sottotitolo + 5 schede (Produttore, Compratore, Cliente privato, Trasporto/Logistica, Laboratorio/Professionista) con icona/titolo/descrizione + "Hai già un account? Accedi".
- **Modulo Produttore multi-step (7 passi A–G)** `/auth/register-producer`: Dati aziendali, Sedi, Referente, Fatturazione, Profilo commerciale, Documentazione, Credenziali+consensi, con barra di avanzamento, campi fiscali **adattati al Paese** (Italia → Codice Fiscale/SDI/PEC), toggle "coincide con sede legale" (produttiva e fatturazione), chip categorie/attività/certificazioni, riepilogo finale.
- Moduli semplici per gli altri 4 ruoli `/auth/register-simple?role=` (consumatore senza dati aziendali; business/logistica/laboratorio con approvazione admin).
- Consensi legali condivisi (`src/components/consents.tsx`): condizioni + privacy obbligatori, marketing separato e facoltativo; pagine legali `/legal/terms` e `/legal/privacy`.
- Backend `/auth/register` esteso (non distruttivo): richiede consensi (422 altrimenti), salva consensi con versione+timestamp UTC, `email_verified=False` (soft; banner rimandato a Fase 3), profilo Produttore validato server-side via `ProducerProfileIn`, campi legacy derivati per retrocompatibilità. `public_user` espone `email_verified` (default True per utenti legacy) e `marketing_consent`. Login/approvazione invariati.
- NON in Fase 1 (come concordato): verifica email attiva + reset password + anti brute-force (Fase 3), upload documenti su Object Storage (Fase 4), moduli completi degli altri 4 ruoli (Fase 2).
- Test: backend 17/17 pass (`tests/test_registration_phase1.py`); frontend E2E registrazione consumer + rendering landing/wizard verificati.

### Notifiche in-app più ricche (2026-06, questa iterazione)
- Campanella con badge "non letti" (refetch 30s) nell'hub Trade e nella dashboard → apre gli Avvisi.
- Filtri avvisi per tipo e gravità + "Segna tutti come letti" (`GET /regulatory/alerts?type=&severity=`, `POST /regulatory/alerts/read-all`).
- Dashboard: card "Alert normativi" con conteggio reale + sezione "Avvisi normativi" con gli ultimi 5 (stato letto/non letto) e link alla lista (`/trade/dashboard` ora restituisce `recent_alerts`).
- Test: 16/16 backend pass (`tests/test_regulatory_notifications.py`); UI verificata (smoke dashboard).

### Alert Normativi + Monitoraggio + Change Detector + Push (2026-06, questa iterazione)
- **Monitoraggio** (produttore): `POST/GET/DELETE /regulatory/monitors` — il produttore "segue" un paese (+prodotto/categoria) idempotente.
- **Alert Engine**: `create_alert()` genera avvisi e li distribuisce ai produttori che monitorano quel paese/categoria + invia push (best-effort). Trigger automatici: nuova versione documento (con diff), nuovo requisito, requisito verificato, e `source_change` dal Change Detector.
- **Change Detector automatico**: all'avvio + sweep periodico (6h) + `POST /regulatory/change-detection/run` (admin) — scarica le pagine delle fonti ufficiali, ne calcola il fingerprint del testo e genera un alert "da verificare" quando cambia (prima osservazione = baseline). Onesto sui limiti: la modifica va verificata dall'admin.
- **API Alert**: `GET /regulatory/alerts` (produttore: solo quelli dei suoi monitoraggi con stato letto/non letto; admin: tutti), `GET /regulatory/alerts/unread-count`, `POST /regulatory/alerts/{id}/read`. `/center` ora riporta changes_detected/alerts_generated/monitors. Dashboard trade: conteggio alert non letti reale.
- **Push notifications** (Emergent managed, SuprSend relay): `POST /api/register-push` + `send_push()` (`EMERGENT_PUSH_KEY=placeholder` in dev); frontend `_layout.tsx` (handler+canale+tap) e `src/push.ts` registrati al login/apertura; `app.json` con plugin expo-notifications + googleServicesFile. ⚠️ Testabile solo su build reale dopo deploy, non in Expo Go.
- **Frontend**: schermata `/trade/alerts` (tab Avvisi/Monitoraggi, diff, badge DEMO/da-verificare, tap per segnare letto, stop monitoraggio; admin: "Controlla fonti ufficiali ora"). Pulsante "Monitora aggiornamenti" in analisi di mercato e nel dettaglio analisi. Voce "Avvisi normativi" nell'hub Trade e nel Centro Normativo admin.
- Fix: crash `trade/market.tsx` (import `useQuery` mancante) risolto.
- Test: 19/19 backend pass (`tests/test_regulatory_alerts.py`); UI verificata (smoke alerts + market).

### Regulatory Intelligence Engine — CORE (2026-06, questa iterazione)
- Percorso minimo completo: SOURCE → DOCUMENT → VERSION → REQUIREMENT → KNOWLEDGE BASE → MARKET ANALYSIS → COMPLIANCE → REGULATORY SNAPSHOT. ✅
- Backend `routers/regulatory.py` (registrato in `server.py`): CRUD admin per fonti/documenti/versioni (dedupe fingerprint, 409 su contenuto identico, diff versioni)/requisiti; `/knowledge` per produttore; `/snapshots/{analysis_id}` (ownership); `/center` (statistiche) e `/audit`. Confidence engine spiegabile (A/B/C/D + verifica umana + recency + match) e rilevamento conflitti tra fonti (mai risolti d'ufficio).
- Integrazione AI (`routers/trade.py`): market-analysis async e compliance ora recuperano i `Requirements` reali dalla KB per paese/categoria/HS, li iniettano nel prompt, restituiscono `data.kb` (requisiti+fonti+conflitti+has_official_source) e la market-analysis crea un `RegulatorySnapshot` (`snapshot_id`). Se nessuna fonte ufficiale → "Fonte ufficiale non disponibile/verificata".
- Seed idempotente `seed_regulatory.py`: 4 fonti ufficiali reali (EUR-Lex Reg. 1169/2011, Commissione UE DG SANTE, TARIC, FDA), 4 documenti, 14 requisiti per Germania/Francia/Spagna/USA — tutti `is_demo=True`.
- Frontend: schermata admin `/admin/regulatory` (statistiche + tab Fonti/Documenti/Requisiti + form di creazione + verifica URL fonte + verifica umana requisito), link da pannello admin. Vista KB (confidence, affidabilità A/B/C/D, conflitti, stato fonte ufficiale) in Analisi di mercato e Compliance.
- NON implementato in questa iterazione (come da richiesta utente): Change Detector, Update Engine automatico, Alert Engine.
- Test: 19/19 backend pass (`tests/test_regulatory_engine.py`); UI admin verificata (smoke).

### Sessione precedente
- Full stack, auth JWT RBAC, B2C + B2B + logistica + etichette + visibilità, import PDF (Gemini) + email, Chi siamo, integrazione logo/splash/icone.
### Questa iterazione (2026-06)
- Modello prodotto standard con campi ingrosso (backend + form + scheda prodotto). ✅
- **RA MIA Trade Assistant** (AI Trade & Compliance + Export Workflow, core): l'ex "Consulente Export AI" trasformato in agente integrato. ✅
  - Backend `routers/trade.py`: market-analysis (asincrono: POST ritorna subito `{id,status:pending}`, worker GPT-5.4 in background, polling via GET /trade/analyses/{id}; evita timeout edge ~100s), find-markets (classifica trasparente), compliance (ok/warn/missing), export-plan (10 step cliccabili + toggle), find-buyers (match distributori), dashboard, analyses history (versionata). Perplexity non configurato → `live=false`, fonti/affidabilità "da verificare".
  - Prodotto esteso con campi conformità opzionali: ingredients, allergens, shelf_life, net_weight, packaging, hs_code.
  - Frontend `app/trade/*`: hub (4 azioni), market, markets, compliance, plan/[id], dashboard, history, analysis/[id], buyers + componenti condivisi `src/components/trade.tsx` (ProductPicker, CountryChips, ReliabilityBadge, SourceList, MarketAnalysisView). Pulsanti in scheda prodotto: "Esplora nuovi mercati" / "Chiedi all'AI Trade Assistant". Entry da Profilo e dashboard produttore.
  - Ruoli/privacy: solo producer/admin; un produttore vede solo le proprie analisi/piani.
  - Testato: endpoint trade verificati (testing agent iteration_5) + flusso asincrono market-analysis verificato (pending→ready).
- Scheda azienda pubblica + editor (certificazioni/premi/fiere) + dati fatturazione. ✅ (`/company-profile`, `/producer/[id]`, `/api/profiles/*`, `/api/producers/*`)
- Consulente Export AI (GPT-5.4, Perplexity ready, fonti, disclaimer, storico). ✅ (`/advisor`, `/api/advisor/*`)
- Ricerca AI acquisti con consiglio di risparmio + link spedizione condivisa. ✅ (`/ai-search`, `/api/ai/search`)
- Bozza prodotto AI da descrizione. ✅ (`/api/ai/product-draft`, card in product-form)
- Pannello guadagni owner. ✅ (`/earnings`, `/api/admin/earnings`)
- Approvazione account business/collaboratore/logistica (pending + gate 403 + admin approva). ✅
- Logistica: catena del freddo + tipo trasporto (piccoli/grandi). ✅
- Seed arricchito (profili, certificazioni, premi, fiere, campi ingrosso, approved).
- Test: 36/36 backend pass (`tests/test_iteration2.py`), flussi frontend verificati.

## Backlog prioritizzato
### P1
- **Trade Assistant iterazione 2**: Alert normativi (monitora mercato/prodotto), Regulatory Knowledge Base + Update Engine (strutture aggiornabili da admin, popolate solo con fonti verificate), analisi etichetta da immagine caricata (vision).
- Attivare Perplexity Sonar (fornire `PERPLEXITY_API_KEY`) → fonti ufficiali verificate 🟢 in tempo reale nel Trade Assistant.
- Stripe/Razorpay per pagamenti reali (ora checkout simulato) → attiva incassi reali del pannello guadagni.
- Email dedicata reale per notifiche approvazione prodotti (ora `delivered@resend.dev`).
### P2
- Contatti reali (email/telefono/città/social) in fondo a "Chi siamo".
- Unificazione completa offerte B2B dentro il prodotto (ora coesistono product wholesale + offerte B2B).
- Sezione reclutamento aziende logistica ampliata.
- Indicatore "sto ragionando…" più evidente e timeout client più alto nel Consulente Export (latenza GPT-5.4).

## Note tecniche
- DB preview resettato e riseminato in questa iterazione (dati demo). Prod diverge dopo primo deploy.
- Datetime timezone-aware; safe-area via react-native-safe-area-context.
- Ogni nuova stringa UI aggiunta in `src/i18n.tsx` (IT + EN).
- `PERPLEXITY_API_KEY` vuota → advisor `live=false` (fallback conoscenza esperta).

## Ristrutturazione per aree e ruoli (Ott 2026)
- Nuova struttura route: (public) [/, /chi-siamo, /come-funziona, /legal/*], (auth) [/login, /register, /register-producer, /register-buyer, /register-simple], (app) protetto con guard per ruolo:
  - /producer/* (dashboard, catalogo + import/form/[id], offerte + richieste compratori, lotti, etichette, visibilita, ordini ricevuti, incassi, export (RA MIA Trade), spedizioni, azienda, profilo)
  - /buyer/* (mercato, ricerca-ai, trattative + alerts + history, richieste RFQ, ordini, checkout, analisi acquisti, piani, spedizioni, azienda, profilo) — consumer + business
  - /logistics/* (spedizioni, preventivi, tracciamento, azienda, profilo)
  - /compliance/* (servizi, documenti privati su Object Storage, requisiti-mercato) — collaborator + produttori
  - /admin/* (dashboard, utenti + verifica, regolatorio, moderazione, categorie, incassi) — admin può vedere tutte le aree
  - /shared/product/[id], /shared/producer/[id], /shared/b2b/[id]
- Backend nuovo `routers/platform.py`: lots, orders/received, producer/earnings, rfq, buyer/plans (simulato), buyer/analytics, logistics/quotes/mine, tracking, compliance/documents (privati), admin/users + sospensione, moderazione offerte, categories (seed).
- Vecchi indirizzi rimossi senza rimandi (scelta utente).
- Iterazione 11: back con cronologia nelle tab, scelta del trasportatore da parte del cliente (select-quote atomico; tracciamento solo dal trasportatore scelto; niente preventivi dopo la scelta o doppi), trattative bloccate per i consumatori, limite di 3 richieste nel piano Base, banner "in attesa di approvazione" nel mercato. Test backend: 31/31.
### Backlog
- Fase 3 registrazione: verifica email (banner), reset password, protezione anti brute-force.
- Moduli dettagliati di registrazione per logistica e laboratorio (il compratore è fatto).
- Pagamenti reali (Stripe) al posto di quelli simulati: checkout, visibilità, piani compratore.
- Notifiche push: google-services.json al momento del deploy.

## 'Ra mia — Fondamenta (Ott 2026)
- Ruoli: nomi attuali mantenuti (consumer=buyer_b2c, business=buyer_b2b, logistics=carrier, collaborator=lab) + nuovo `reseller`.
- core/rules.py: regole commerciali versionate in DB (`business_rules`): mediazione 3% buyer + 2% produttore, introduzione 2% (finestra 18 mesi), trasporto 1% produttore che prenota, etichette 1%, minimi per servizio. Snapshot immutabile `commercial_snapshot` su ordini, accordi B2B, scelta vettore, offerte etichette, dichiarazioni.
- core/audit.py (audit_logs prima/dopo), core/permissions.py (matrice ruoli in DB `role_permissions`, require_perm), core/tokens.py (refresh token a rotazione).
- Piani compratore rimossi; pacchetti visibilità da DB (`visibility_packages`).
- routers/governance.py: regole admin, audit, permessi, preventivo commissioni, dichiarazioni affari fuori piattaforma.
- routers/accounts.py: verifica email, reset password, 2FA TOTP (admin/business), onboarding a step per ruolo con bozza (schemi in DB), checklist documentale per ruolo (DB), stati documento, console admin, sospensione, eventi di verifica, CSV log conformità, promemoria scadenza 30/15/5 (DB), badge "Verificato da 'Ra mia".
- API docs: /api/docs.
### Da fare (richiesti, non ancora implementati)
Registro Match append-only con hash; motore regole v2 (scope/promo/simulatore); pagamenti Stripe Connect con escrow/split/dispute; B2B strutturato (versioni, listini riservati, Incoterms); catalogo esteso (scaglioni, nutrizionali, ricerca salvata, catalogo pubblico); motore logistico (rate card, forbice, POD, aggregazione); flusso etichette con revisioni e bundle; e-commerce B2C completo (recesso, recensioni, EPR); negozi dropshipping reseller; control tower admin; anticipo fatture; documenti legali/GDPR; SEO.

## Iterazione 13 — Pagamenti reali con escrow + Registro Match + Motore logistico
- Stripe Checkout reale (chiave test): ordini (status awaiting_payment → paid/escrow held), trasporti, visibilità. Importi calcolati server-side. `/api/payments/checkout`, `/api/payments/status/{sid}`, `/api/webhook/stripe`.
- Escrow: held → released (conferma cliente, POD vettore, rilascio automatico dopo N giorni da `payment_settings`) / disputed → admin release|refund (audit). Split: payout produttore = quota merce − fee snapshot; vettore = prezzo vettore. Payout `pending_connect` finché il beneficiario non collega Stripe Connect (richiede account Stripe proprio di 'Ra mia).
- Registro Match (`core/matches.py`): append-only, hash-chain, una voce per coppia produttore↔compratore (trattativa, risposta RFQ, ordine pagato), finestra da regole; `/api/matches`, `/api/admin/matches/verify`. Dichiarazioni usano il registro.
- Motore logistico (`routers/rates.py`): tariffari vettori CRUD, preventivo immediato con forbice prezzi e breakdown, prenotazione da tariffa, POD obbligatoria su "consegnato" che rilascia l'escrow al vettore.
- UI: /pagamento, buyer/ordini (paga/annulla/conferma/contesta), producer+logistics incassi (Payouts), logistics/tariffe, spedizioni/preventivo, admin/pagamenti, admin/match.
- Dati fiscali 'Ra mia: segnaposto (da fornire).
