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
