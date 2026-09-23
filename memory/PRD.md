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
### Sessione precedente
- Full stack, auth JWT RBAC, B2C + B2B + logistica + etichette + visibilità, import PDF (Gemini) + email, Chi siamo, integrazione logo/splash/icone.
### Questa iterazione (2026-06)
- Modello prodotto standard con campi ingrosso (backend + form + scheda prodotto). ✅
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
- Stripe/Razorpay per pagamenti reali (ora checkout simulato) → attiva incassi reali del pannello guadagni.
- Email dedicata reale per notifiche approvazione prodotti (ora `delivered@resend.dev`).
- Attivare Perplexity Sonar (fornire `PERPLEXITY_API_KEY`) per dati web in tempo reale nel Consulente Export.
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
