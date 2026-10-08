export type Role =
  | "consumer"
  | "producer"
  | "business"
  | "collaborator"
  | "logistics"
  | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  locale: string;
  company_name?: string | null;
  region?: string | null;
  business_type?: string | null;
  specialty?: string | null;
  fleet_info?: string | null;
  featured_until?: string | null;
  created_at?: string | null;
  approved?: boolean;
  bio?: string | null;
  bio_en?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  logistics_service?: string | null;
}

export interface ProfileItem {
  name: string;
  year?: string | null;
  place?: string | null;
  image_url?: string | null;
}

export interface Billing {
  legal_name?: string | null;
  billing_address?: string | null;
  billing_country?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
  sdi_code?: string | null;
  pec_email?: string | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  role: string;
  company_name: string;
  region?: string | null;
  bio?: string | null;
  bio_en?: string | null;
  website?: string | null;
  phone?: string | null;
  city?: string | null;
  logistics_service?: string | null;
  certifications: ProfileItem[];
  awards: ProfileItem[];
  fairs: ProfileItem[];
  billing?: Billing;
  products?: Product[];
}

export interface Earnings {
  advertising: number;
  sales_volume: number;
  sales_commission: number;
  logistics_volume: number;
  logistics_commission: number;
  labels_volume: number;
  labels_commission: number;
  total: number;
  rates: { sales: number; logistics: number; labels: number };
}

export interface PendingAccount {
  id: string;
  name: string;
  email: string;
  role: string;
  company_name: string;
  region?: string | null;
  business_type?: string | null;
  specialty?: string | null;
  fleet_info?: string | null;
}

export interface AdvisorReply {
  reply: string;
  citations: string[];
  live: boolean;
}

export interface AiSearchResult {
  answer: string;
  products: Product[];
  shipment_id?: string | null;
}

export interface TradeSource {
  title: string;
  url: string;
  authority?: string;
  date?: string;
  reliability: "verified" | "to_verify";
}

export interface KbConfidence {
  level: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  reasons: string[];
}

export interface KbRequirement {
  id: string;
  requirement_type: string;
  description: string;
  severity?: "low" | "medium" | "high";
  source_name?: string;
  source_url?: string;
  source_reliability?: "A" | "B" | "C" | "D";
  is_demo?: boolean;
  verification_status?: string;
  confidence?: KbConfidence;
}

export interface KbSource {
  id: string;
  name?: string;
  authority?: string;
  url?: string;
  reliability?: "A" | "B" | "C" | "D";
  last_verified?: string | null;
  is_demo?: boolean;
  status?: string;
}

export interface KbConflict {
  requirement_type: string;
  entries: { source?: string; description?: string }[];
  status?: string;
  note?: string;
}

export interface KbBlock {
  requirements: KbRequirement[];
  sources: KbSource[];
  conflicts: KbConflict[];
  has_official_source: boolean;
}

export interface RegSource {
  id: string;
  name: string;
  authority: string;
  country: string;
  category?: string | null;
  url: string;
  source_type: string;
  reliability: "A" | "B" | "C" | "D";
  notes?: string | null;
  is_demo: boolean;
  status: "active" | "to_verify" | "unreachable" | "disabled";
  reachable?: boolean | null;
  last_checked?: string | null;
}

export interface RegDocument {
  id: string;
  source_id: string;
  title: string;
  url?: string;
  country: string;
  category?: string | null;
  current_version: number;
  status: string;
  is_demo: boolean;
}

export interface RegRequirement {
  id: string;
  country: string;
  category?: string | null;
  requirement_type: string;
  description: string;
  severity: "low" | "medium" | "high";
  source_id: string;
  source_name?: string;
  source_reliability?: "A" | "B" | "C" | "D";
  verification_status: string;
  is_demo: boolean;
}

export interface RegCenter {
  sources_active: number;
  sources_to_verify: number;
  sources_unreachable: number;
  sources_total: number;
  documents: number;
  requirements: number;
  requirements_demo: number;
  snapshots: number;
  changes_detected: number;
  alerts_generated: number;
  monitors?: number;
}

export interface RegAlert {
  id: string;
  type: "version" | "requirement_new" | "requirement_verified" | "source_change";
  country: string;
  category?: string | null;
  title: string;
  detail: string;
  severity: "low" | "medium" | "high";
  diff?: { added?: string[]; removed?: string[] } | null;
  source_id?: string | null;
  document_id?: string | null;
  requirement_id?: string | null;
  is_demo?: boolean;
  needs_verification?: boolean;
  read?: boolean;
  created_at: string;
}

export interface RegMonitor {
  id: string;
  product_id?: string | null;
  product_name?: string | null;
  country: string;
  category?: string | null;
  created_at: string;
}

export interface MarketData {
  summary?: string;
  accessibility?: string;
  hs_code?: string;
  customs?: string;
  duties?: string;
  taxes?: string;
  health?: string;
  food_safety?: string;
  import_requirements?: string;
  labeling?: { language?: string; allergens?: string; packaging?: string; shelf_life?: string; mandatory?: string[] };
  documents?: string[];
  certifications?: string[];
  importer_requirements?: string;
  logistics?: string;
  controls?: string;
  risks?: string[];
  actions?: string[];
  missing_info?: string[];
  sources?: TradeSource[];
  reliability?: string;
  kb?: KbBlock;
}

export interface TradeAnalysis {
  id: string;
  product_id: string;
  product_name?: string;
  country: string;
  version: number;
  status?: "pending" | "ready" | "error";
  data: MarketData;
  missing_info?: string[];
  live: boolean;
  created_at: string;
  summary?: string;
}

export interface MarketRank {
  country: string;
  score: number;
  reasons: string[];
  complexity?: string;
  data_available?: boolean;
}

export interface ComplianceItem {
  area: string;
  label: string;
  status: "ok" | "warn" | "missing";
  note?: string;
}

export interface ComplianceResult {
  items: ComplianceItem[];
  missing_fields: string[];
  label_adjustment_recommended?: boolean;
  summary?: string;
  image_url?: string | null;
  kb?: KbBlock;
}

export interface PlanStep {
  id: string;
  order: number;
  type: string;
  title: string;
  description: string;
  action?: { kind: string } | null;
  done: boolean;
}

export interface ExportPlan {
  id: string;
  product_id: string;
  product_name?: string;
  country: string;
  analysis_id?: string | null;
  steps: PlanStep[];
  created_at: string;
}

export interface PlanSummary {
  id: string;
  product_id: string;
  product_name?: string;
  country: string;
  total: number;
  done: number;
  created_at: string;
}

export interface TradeBuyer {
  id: string;
  company_name: string;
  business_type?: string | null;
  region?: string;
  match: boolean;
}

export interface TradeDashboard {
  markets_monitored: number;
  products_analyzed: number;
  analyses_completed: number;
  open_actions: number;
  alerts: number;
  recent_alerts?: { id: string; type: string; country: string; title: string; severity: string; read: boolean; created_at: string }[];
  labels_todo: number;
  docs_missing: number;
  opportunities: number;
  activities: { country: string; product_name?: string; summary?: string }[];
  disclaimer: string;
}

export interface Product {
  id: string;
  name: string;
  name_en?: string | null;
  description: string;
  description_en?: string | null;
  category: string;
  price: number;
  unit: string;
  stock: number;
  image_url?: string | null;
  origin_region?: string | null;
  price_wholesale?: number | null;
  moq?: number | null;
  unit_wholesale?: string | null;
  pack_per_carton?: number | null;
  cartons_per_layer?: number | null;
  cartons_per_pallet?: number | null;
  producer_id: string;
  producer_name: string;
  company_name: string;
  status: string;
  featured: boolean;
  featured_until?: string | null;
  created_at: string;
}

export interface PackageItem {
  id: string;
  name: string;
  price: number;
  unit: string;
}

export interface CuratedPackage {
  id: string;
  name: string;
  name_en?: string | null;
  description: string;
  description_en?: string | null;
  price: number;
  image_url?: string | null;
  items: PackageItem[];
}

export interface OrderItem {
  product_id: string;
  name: string;
  price: number;
  unit: string;
  qty: number;
  producer_id: string;
}

export interface Order {
  id: string;
  user_id: string;
  user_name: string;
  items: OrderItem[];
  package_id?: string | null;
  total: number;
  status: string;
  payment: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  notes?: string | null;
  created_at: string;
}

export interface B2BMessage {
  id: string;
  kind: "message" | "agreement" | "system";
  sender_id: string;
  sender_name: string;
  sender_role: string;
  text: string;
  price?: number | null;
  qty?: number | null;
  agreement_status?: string | null;
  at: string;
}

export interface Negotiation {
  id: string;
  offer_id: string;
  offer_title: string;
  business_id: string;
  business_name: string;
  producer_id: string;
  producer_name: string;
  status: string;
  messages: B2BMessage[];
  created_at: string;
}

export interface B2BOffer {
  id: string;
  product_id?: string | null;
  title: string;
  description: string;
  category: string;
  moq: number;
  unit: string;
  unit_price: number;
  origin_region?: string | null;
  available_until?: string | null;
  producer_id: string;
  producer_name: string;
  company_name: string;
  status: string;
  created_at: string;
}

export interface LabelOffer {
  id: string;
  collaborator_id: string;
  collaborator_name: string;
  specialty?: string;
  price: number;
  days: number;
  message: string;
  status: string;
  created_at: string;
}

export interface LabelRequest {
  id: string;
  producer_id: string;
  producer_name: string;
  product_name: string;
  target_market: string;
  needs: string;
  image_url?: string | null;
  status: string;
  offers: LabelOffer[];
  assigned_collaborator_id?: string | null;
  assigned_collaborator_name?: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  company_id: string;
  company_name: string;
  price: number;
  transit_days: number;
  message: string;
  created_at: string;
}

export interface Participant {
  user_id: string;
  name: string;
  role: string;
}

export interface ShippingRequest {
  id: string;
  title: string;
  cargo_type: string;
  origin: string;
  destination: string;
  ready_date?: string | null;
  weight_kg?: number | null;
  pallets?: number | null;
  notes?: string | null;
  shared: boolean;
  cold_chain?: boolean;
  service_size?: string | null;
  creator_id: string;
  creator_name: string;
  creator_role: string;
  status: string;
  participants: Participant[];
  quotes: Quote[];
  created_at: string;
  can_view_quotes?: boolean;
}

export interface VisibilityPlan {
  id: string;
  days: number;
  price: number;
  name: string;
  name_en: string;
  perks_it: string[];
  perks_en: string[];
}

export interface Purchase {
  id: string;
  plan_id: string;
  plan_name: string;
  price: number;
  featured_until: string;
  created_at: string;
}

export interface AdminStats {
  users: number;
  producers: number;
  products: number;
  pending_products: number;
  orders: number;
  b2b_agreements: number;
  shipping_requests: number;
  label_requests: number;
}
