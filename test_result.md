#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build and integrate the "Regulatory Intelligence Engine" CORE into RA MIA Trade Assistant.
  Minimum working path: SOURCE -> DOCUMENT -> VERSION -> REQUIREMENT -> KNOWLEDGE BASE ->
  MARKET ANALYSIS -> COMPLIANCE CHECK -> REGULATORY SNAPSHOT. Do NOT build Change Detector /
  Alert Engine yet. Do NOT fabricate normative data (DEMO flag allowed). Respond in Italian.

backend:
  - task: "Regulatory CRUD API (sources, documents, versions, requirements, knowledge, snapshots, center, audit)"
    implemented: true
    working: "NA"
    file: "/app/backend/routers/regulatory.py"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "Router registered in server.py. Admin-only CRUD for sources/documents/versions/requirements; producer-facing /knowledge; snapshot retrieval; /center stats; /audit. Confidence engine + conflict detection implemented. Idempotent DEMO seed added (seed_regulatory.py): 4 real official sources (EUR-Lex 1169/2011, EC Food Safety, TARIC, FDA), 4 docs, 14 requirements for Germania/Francia/Spagna/USA, all is_demo=True."
  - task: "Trade Assistant grounded on Knowledge Base + Regulatory Snapshot"
    implemented: true
    working: "NA"
    file: "/app/backend/routers/trade.py"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "market-analysis worker now fetches kb_requirements_for(country,category,hs_code), injects KB context into LLM prompt, attaches data.kb (requirements+sources+conflicts+has_official_source) and creates a RegulatorySnapshot (snapshot_id saved on analysis). compliance endpoint also grounds on KB and returns data.kb. Async durability flow unchanged."

frontend:
  - task: "Richer in-app notifications (unread bell, alert filters, mark-all-read, dashboard recent alerts)"
    implemented: true
    working: "NA"
    file: "/app/backend/routers/regulatory.py"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "Backend: GET /regulatory/alerts now accepts optional type & severity query filters (producer list filtered in Python, admin via query); POST /regulatory/alerts/read-all marks all of a producer's visible alerts read (admin no-op). GET /trade/dashboard now returns recent_alerts (last 5 with read flag) alongside integer alerts count. Frontend: reusable NotificationBell (unread badge, 30s refetch) in Trade hub + dashboard headers; alerts screen gains type/severity filter chips + 'mark all read' button; dashboard shows recent alerts section. Smoke-verified: type filter (3 requirement_new all match), dashboard recent=5, read-all marked 6 -> unread 0."
  - task: "Regulatory Alert Engine + Monitors + Change Detector + Push relay"
    implemented: true
    working: "NA"
    file: "/app/backend/routers/regulatory.py"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "Added producer Monitors (POST/GET/DELETE /regulatory/monitors, idempotent). Alert engine: create_alert() fans out to monitoring producers (country + optional category) and sends push (best-effort). Alerts auto-generated on add_version (with diff), create_requirement, verify_requirement, and source_change from the Change Detector. Alerts API: GET /regulatory/alerts (producer sees alerts matching monitors w/ read flag; admin sees all), GET /regulatory/alerts/unread-count, POST /regulatory/alerts/{id}/read. Change Detector: fetches each non-disabled source URL, fingerprints visible text, raises source_change alert on diff (baseline on first run); manual POST /regulatory/change-detection/run (admin) + startup/periodic sweep (start_change_detector). /center now reports changes_detected/alerts_generated/monitors. Push relay router /api/register-push + send_push() per Emergent playbook (EMERGENT_PUSH_KEY=placeholder in dev). Trade /dashboard alerts count wired to unread alerts. Smoke-verified via curl: monitor create, requirement->alert, producer alerts+unread-count=1, change-detection scanned 6/0 changes."

frontend:
  - task: "Regulatory Alerts + Monitors UI + push registration"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/trade/alerts.tsx"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "New /trade/alerts screen (tabs Avvisi/Monitoraggi): alert cards with type icon, diff add/removed, DEMO/to-verify badges, tap-to-read, unread dot; monitors list with stop. Admin sees all alerts + 'Check official sources now' (change-detection run). Entry added to Trade hub (sections) and admin Regulatory Center. 'Monitora aggiornamenti' button added to market.tsx result and analysis/[id].tsx. Push: _layout.tsx module-scope handler+channel+tap listeners; src/push.ts registerForPush() wired into auth signIn + app-open; app.json expo-notifications plugin + googleServicesFile. (Push only testable on real device build; UI smoke-verified.)"
  - task: "Admin Regulatory Center UI"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/admin/regulatory.tsx"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        message: "New screen /admin/regulatory with center stats, 3 tabs (Sources/Documents/Requirements), inline create forms, source URL verify, requirement human-verify. Entry link added in admin.tsx (admin-regulatory-link). KB view (confidence + A/B/C/D reliability + conflicts + official-source status) rendered in Market Analysis and Compliance results."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0

test_plan:
  current_focus:
    - "Richer in-app notifications (unread bell, alert filters, mark-all-read, dashboard recent alerts)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Please test the NEW Regulatory Intelligence backend end-to-end (do not re-test unrelated
      existing endpoints). Admin: admin@saporidisicilia.it / SaporiAdmin2026!. Producer:
      produttore@demo.it / Demo1234!.
      Backend scenarios:
      1) RBAC: /regulatory/sources, /documents, /requirements, /center, /audit require admin (403 for producer).
      2) /regulatory/center returns counts (sources_total=4, documents=4, requirements=14, requirements_demo=14 on fresh demo DB).
      3) Create a SOURCE (admin) -> create a DOCUMENT linked to it -> add a VERSION (fingerprint dedupe: identical content -> 409) -> create a REQUIREMENT linked to source+document.
      4) /regulatory/requirements/{id}/verify: DEMO requirement -> 400; real (non-demo) requirement -> HUMAN_VERIFIED.
      5) /regulatory/knowledge?country=Germania (producer allowed) returns requirements+sources+conflicts and confidence levels (demo => UNVERIFIED).
      6) Trade market-analysis async flow (POST /trade/market-analysis then poll GET /trade/analyses/{id}) eventually status=ready and data.kb present + snapshot created (GET /regulatory/snapshots/{analysis_id} works and respects ownership).
      7) /trade/compliance returns data.kb grounded on KB.
      Note: LLM calls (Gemini) are real; allow polling time.