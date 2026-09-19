# Sapori di Sicilia — PRD

## Original Problem Statement
App mobile di compra-vendita di prodotti agroalimentari per promuovere la dieta mediterranea e la tradizione siciliana. Legame diretto produttore↔consumatore, sezione B2B (agenti, distributori, grossisti, GDO italiani/esteri) con trattative e accordi commerciali, centralizzazione della logistica per abbassare i costi di spedizione, sezione adeguamento etichette con collaboratori esterni, reclutamento aziende di logistica. Produttori e consumatori si gestiscono in autonomia; l'admin cura pacchetti; i produttori pagano pacchetti di visibilità.

## User Choices
- Lingua: Italiano + Inglese (switcher IT/EN in-app)
- Pagamenti: checkout simulato (Stripe da attivare in seguito)
- Visibilità: pagata dai produttori (boost prodotti)
- Stile: Mediterraneo siciliano (terracotta, verde oliva, crema) — Editorial, Playfair Display + DM Sans
- Foto prodotti: caricate dai produttori + catalogo demo iniziale

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Routers: auth, market, b2b, logistics, admin, uploads. JWT auth (RBAC, ruoli: consumer/producer/business/collaborator/logistics/admin). Emergent Object Storage per le foto. Seed automatico di dati demo.
- **Frontend**: Expo Router (file-based). 4 tab: Mercato, B2B, Spedizioni, Profilo. React Query per i dati server, Context per auth/cart/i18n/toast. Tema in src/theme.ts.

## User Personas
- Consumatore: compra prodotti autentici siciliani
- Produttore: pubblica prodotti, compra visibilità, tratta B2B, chiede etichette/spedizioni
- Business (agente/distributore/grossista/GDO): tratta e stipula accordi con produttori
- Collaboratore etichette: propone servizi di conformità export
- Azienda di logistica: quota le spedizioni condivise
- Admin/curatore: approva prodotti, crea pacchetti curati

## Core Requirements (static)
1. Marketplace B2C con catalogo, carrello, checkout simulato, ordini
2. Dashboard produttore: CRUD prodotti (con foto), stato approvazione, boost visibilità
3. B2B: offerte all'ingrosso, trattative con messaggi, proposta/accettazione accordi
4. Logistica centralizzata: richieste spedizione condivisibili, partecipanti, preventivi dai vettori
5. Adeguamento etichette: richieste + proposte collaboratori + assegnazione + avanzamento
6. Admin: approvazione prodotti, pacchetti curati, statistiche
7. Bilingue IT/EN, pagamenti simulati

## Implemented (2026-06)
- [x] Auth JWT + RBAC, 8 account demo seed
- [x] Marketplace: home editoriale (hero, pacchetti, chips categorie, griglia), dettaglio prodotto, carrello persistente
- [x] Checkout simulato + storico ordini
- [x] Dashboard produttore + form prodotto con upload foto (Object Storage) + permessi galleria
- [x] Pacchetti visibilità (boost 7/30/90 gg) con pagamento simulato → featured
- [x] B2B: offerte, trattative chat, proposta/accettazione accordi
- [x] Logistica: partner, richieste condivise, join, preventivi
- [x] Etichette: richieste, proposte collaboratori, assegnazione, completamento
- [x] Admin: statistiche, approvazione prodotti, creazione pacchetti curati
- [x] i18n IT/EN, tema mediterraneo, font Playfair/DM Sans
- [x] **Import catalogo PDF** (dashboard produttore): upload PDF → estrazione prodotti con Gemini 3 Flash → prodotti in stato pending → email di riepilogo all'admin (Resend gestito). Endpoint POST /api/products/import-pdf.
- [x] **Notifica email** all'admin (NOTIFY_EMAIL) ad ogni aggiunta prodotti (import PDF + creazione manuale) con nome, etichetta/categoria, prezzo produttore e immagine.
- [x] **Pagina controllo etichette** dedicata nella dashboard produttore (/producer-labels).

## Integrations
- Gemini 3 Flash (gemini-3-flash-preview) via emergentintegrations + EMERGENT_LLM_KEY — estrazione prodotti da PDF.
- Emergent-managed Resend — email transazionali (EMERGENT_EMAIL_KEY, EMAIL_FROM_NAME, NOTIFY_EMAIL, opz. EMAIL_REPLY_TO).
- NOTA: NOTIFY_EMAIL è impostata su delivered@resend.dev (indirizzo di test) finché l'utente non fornisce la sua email dedicata reale.

## Backlog
### P1
- Pagamenti reali con Stripe (consumatori + pacchetti visibilità)
- Notifiche in-app per nuove offerte/trattative/preventivi
- Recensioni prodotti e produttori
### P2
- Mappa interattiva delle spedizioni condivise
- Firma digitale accordi B2B (PDF)
- Reclutamento logistica: onboarding vettori con verifica documenti

## Next Tasks
- Attivare Stripe quando l'utente fornisce le chiavi
- Ampliare traduzioni EN sui contenuti dinamici dei produttori
