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
