from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


def oid_validator(v):
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(oid_validator)]

Role = Literal["consumer", "producer", "business", "collaborator", "logistics"]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: PyObjectId | None = Field(None, alias="_id")

    def to_mongo(self, include_id: bool = False) -> dict:
        d = self.model_dump(by_alias=True, exclude_none=True)
        if include_id and self.id:
            d["_id"] = self.id
        else:
            d.pop("_id", None)
        return d

    @classmethod
    def from_mongo(cls, doc: dict | None):
        if not doc:
            return None
        d = dict(doc)
        d["id"] = str(d.pop("_id", None))
        return cls(**d)


# ----------------------------- Auth -----------------------------

class ConsentIn(BaseModel):
    terms: bool = False
    privacy: bool = False
    marketing: bool = False


class RegAddressIn(BaseModel):
    street: Optional[str] = Field(None, max_length=200)
    zip: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=120)
    region: Optional[str] = Field(None, max_length=120)
    country: Optional[str] = Field(None, max_length=60)


class RegCompanyIn(BaseModel):
    legal_name: Optional[str] = Field(None, max_length=200)
    legal_form: Optional[str] = Field(None, max_length=120)
    brand_name: Optional[str] = Field(None, max_length=200)
    country_incorp: Optional[str] = Field(None, max_length=60)
    vat_id: Optional[str] = Field(None, max_length=60)
    tax_code: Optional[str] = Field(None, max_length=60)
    registry_no: Optional[str] = Field(None, max_length=100)
    website: Optional[str] = Field(None, max_length=200)
    email: Optional[str] = Field(None, max_length=160)
    phone: Optional[str] = Field(None, max_length=60)


class RegContactIn(BaseModel):
    first_name: Optional[str] = Field(None, max_length=120)
    last_name: Optional[str] = Field(None, max_length=120)
    role_title: Optional[str] = Field(None, max_length=120)
    email: Optional[str] = Field(None, max_length=160)
    phone: Optional[str] = Field(None, max_length=60)


class RegBillingIn(BaseModel):
    billing_name: Optional[str] = Field(None, max_length=200)
    vat_id: Optional[str] = Field(None, max_length=60)
    address: Optional[RegAddressIn] = None
    sdi_code: Optional[str] = Field(None, max_length=20)
    pec: Optional[str] = Field(None, max_length=160)
    same_as_legal: bool = False


class RegCommercialIn(BaseModel):
    company_type: Optional[str] = Field(None, max_length=120)
    product_categories: List[str] = Field(default_factory=list)
    activity: Optional[str] = Field(None, max_length=120)
    domestic_markets: Optional[str] = Field(None, max_length=300)
    intl_markets: Optional[str] = Field(None, max_length=300)
    min_quantities: Optional[str] = Field(None, max_length=200)
    packaging: Optional[str] = Field(None, max_length=200)


class ProducerProfileIn(BaseModel):
    company: RegCompanyIn = Field(default_factory=RegCompanyIn)
    legal_address: RegAddressIn = Field(default_factory=RegAddressIn)
    production_address: Optional[RegAddressIn] = None
    production_same_as_legal: bool = False
    other_locations: List[RegAddressIn] = Field(default_factory=list)
    contact: RegContactIn = Field(default_factory=RegContactIn)
    billing: RegBillingIn = Field(default_factory=RegBillingIn)
    commercial: RegCommercialIn = Field(default_factory=RegCommercialIn)
    certifications: List[str] = Field(default_factory=list)
    documents_note: Optional[str] = Field(None, max_length=1000)


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    role: Role
    locale: str = "it"
    company_name: Optional[str] = None
    region: Optional[str] = None
    business_type: Optional[str] = None
    specialty: Optional[str] = None
    fleet_info: Optional[str] = None
    profile: Optional[dict] = None
    consents: Optional[ConsentIn] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LocaleIn(BaseModel):
    locale: str = "it"


# ----------------------------- Products -----------------------------

class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    name_en: Optional[str] = None
    description: str = Field(min_length=10, max_length=2000)
    description_en: Optional[str] = None
    category: str
    price: float = Field(gt=0)
    unit: str
    stock: float = Field(ge=0)
    image_url: Optional[str] = None
    origin_region: Optional[str] = None
    # Wholesale / B2B (standard product model)
    price_wholesale: Optional[float] = Field(None, ge=0)
    moq: Optional[float] = Field(None, ge=0)
    unit_wholesale: Optional[str] = None
    pack_per_carton: Optional[int] = Field(None, ge=0)
    cartons_per_layer: Optional[int] = Field(None, ge=0)
    cartons_per_pallet: Optional[int] = Field(None, ge=0)
    # Compliance / export data (optional)
    ingredients: Optional[str] = None
    allergens: Optional[str] = None
    shelf_life: Optional[str] = None
    net_weight: Optional[str] = None
    packaging: Optional[str] = None
    hs_code: Optional[str] = None


class ProductDoc(BaseDocument):
    name: str
    name_en: Optional[str] = None
    description: str
    description_en: Optional[str] = None
    category: str
    price: float
    unit: str
    stock: float
    image_url: Optional[str] = None
    origin_region: Optional[str] = None
    price_wholesale: Optional[float] = None
    moq: Optional[float] = None
    unit_wholesale: Optional[str] = None
    pack_per_carton: Optional[int] = None
    cartons_per_layer: Optional[int] = None
    cartons_per_pallet: Optional[int] = None
    ingredients: Optional[str] = None
    allergens: Optional[str] = None
    shelf_life: Optional[str] = None
    net_weight: Optional[str] = None
    packaging: Optional[str] = None
    hs_code: Optional[str] = None
    producer_id: str
    producer_name: str
    company_name: str
    status: str = "pending"
    featured_until: Optional[datetime] = None
    created_at: datetime
    deleted_at: Optional[datetime] = None

    def to_public(self) -> dict:
        d = self.model_dump(mode="json")
        fu = self.featured_until
        if fu is not None and fu.tzinfo is None:
            fu = fu.replace(tzinfo=timezone.utc)
        d["featured"] = bool(fu and fu > datetime.now(timezone.utc))
        return d


# ----------------------------- Orders -----------------------------

class OrderItemIn(BaseModel):
    product_id: str
    qty: float = Field(gt=0)


class OrderIn(BaseModel):
    items: list[OrderItemIn] = []
    package_id: Optional[str] = None
    address: str
    city: str
    zip: str
    phone: str
    notes: Optional[str] = None


# ----------------------------- Visibility -----------------------------

class PurchaseIn(BaseModel):
    plan_id: str


# ----------------------------- Packages -----------------------------

class PackageIn(BaseModel):
    name: str
    name_en: Optional[str] = None
    description: str
    description_en: Optional[str] = None
    price: float = Field(gt=0)
    product_ids: list[str]
    image_url: Optional[str] = None


# ----------------------------- B2B -----------------------------

class B2BOfferIn(BaseModel):
    product_id: Optional[str] = None
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=10, max_length=2000)
    category: str
    moq: float = Field(gt=0)
    unit: str
    unit_price: float = Field(gt=0)
    origin_region: Optional[str] = None
    available_until: Optional[str] = None


class NegotiationStartIn(BaseModel):
    message: Optional[str] = None


class B2BMessageIn(BaseModel):
    text: Optional[str] = None
    price: Optional[float] = None
    qty: Optional[float] = None


class AgreementIn(BaseModel):
    price: float = Field(gt=0)
    qty: float = Field(gt=0)
    terms: Optional[str] = None


class AgreementRespondIn(BaseModel):
    action: Literal["accept", "reject"]


# ----------------------------- Logistics -----------------------------

class ShippingRequestIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    cargo_type: str
    origin: str
    destination: str
    ready_date: Optional[str] = None
    weight_kg: Optional[float] = Field(None, ge=0)
    pallets: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = None
    shared: bool = True
    cold_chain: bool = False
    service_size: Optional[str] = None  # piccoli | grandi


class QuoteIn(BaseModel):
    price: float = Field(gt=0)
    transit_days: int = Field(ge=1)
    message: Optional[str] = None


# ----------------------------- Labels -----------------------------

class LabelRequestIn(BaseModel):
    product_name: str = Field(min_length=2, max_length=120)
    target_market: str
    needs: str = Field(min_length=10, max_length=2000)
    image_url: Optional[str] = None


class LabelOfferIn(BaseModel):
    price: float = Field(gt=0)
    days: int = Field(ge=1)
    message: Optional[str] = None


class LabelAcceptIn(BaseModel):
    collaborator_id: str


class LabelStatusIn(BaseModel):
    status: Literal["in_progress", "done"]


# ----------------------------- Company profile & billing -----------------------------

class ProfileItem(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    year: Optional[str] = None
    place: Optional[str] = None
    image_url: Optional[str] = None


class BillingIn(BaseModel):
    legal_name: Optional[str] = None
    billing_address: Optional[str] = None
    billing_country: Optional[str] = None
    vat_number: Optional[str] = None
    tax_code: Optional[str] = None
    sdi_code: Optional[str] = None
    pec_email: Optional[str] = None


class ProfileIn(BaseModel):
    bio: Optional[str] = Field(None, max_length=2000)
    bio_en: Optional[str] = Field(None, max_length=2000)
    website: Optional[str] = None
    phone: Optional[str] = None
    city: Optional[str] = None
    company_name: Optional[str] = None
    region: Optional[str] = None
    logistics_service: Optional[str] = None  # piccoli | grandi | entrambi
    certifications: list[ProfileItem] = []
    awards: list[ProfileItem] = []
    fairs: list[ProfileItem] = []
    billing: Optional[BillingIn] = None


# ----------------------------- AI assistants -----------------------------

class AdvisorChatIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=80)
    message: str = Field(min_length=2, max_length=4000)
    context: Optional[str] = None


class BuyerSearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=600)
    quantity: Optional[str] = None
    destination: Optional[str] = None
    budget: Optional[str] = None


class AiDraftIn(BaseModel):
    description: str = Field(min_length=5, max_length=2000)
    category: Optional[str] = None


# ----------------------------- Admin -----------------------------

class AccountReviewIn(BaseModel):
    action: Literal["approve", "reject"]


# ----------------------------- Trade Assistant -----------------------------

class TradeMarketIn(BaseModel):
    product_id: str
    country: str = Field(min_length=2, max_length=60)
    extra: Optional[dict] = None  # missing compliance fields provided by producer


class TradeComplianceIn(BaseModel):
    product_id: str
    country: str = Field(min_length=2, max_length=60)
    label_text: Optional[str] = Field(None, max_length=4000)
    image_url: Optional[str] = None
    extra: Optional[dict] = None


class TradeFindMarketsIn(BaseModel):
    product_id: str


class ExportPlanCreateIn(BaseModel):
    product_id: str
    country: str = Field(min_length=2, max_length=60)
    analysis_id: Optional[str] = None


class StepToggleIn(BaseModel):
    done: bool


class FindBuyersIn(BaseModel):
    country: Optional[str] = None
    category: Optional[str] = None


# ----------------------------- Regulatory Intelligence -----------------------------

SOURCE_TYPES = [
    "OFFICIAL_GOVERNMENT", "OFFICIAL_CUSTOMS", "OFFICIAL_HEALTH", "OFFICIAL_FOODSAFETY",
    "OFFICIAL_TARIFF", "OFFICIAL_EU", "INTERNATIONAL_ORGANIZATION", "OFFICIAL_LEGISLATION",
    "AUTHORIZED_DATABASE", "SECONDARY_SOURCE", "UNVERIFIED_SOURCE",
]
REQUIREMENT_TYPES = [
    "CUSTOMS", "TARIFF", "FOOD_SAFETY", "HEALTH", "LABEL", "PACKAGING", "INGREDIENT",
    "ALLERGEN", "CERTIFICATION", "DOCUMENT", "IMPORTER", "LOGISTICS", "OTHER",
]


class SourceIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    authority: str = Field(min_length=2, max_length=200)
    country: str = Field(min_length=2, max_length=60)
    language: Optional[str] = "it"
    category: Optional[str] = None
    url: str = Field(min_length=4, max_length=600)
    source_type: Literal[tuple(SOURCE_TYPES)] = "OFFICIAL_GOVERNMENT"  # type: ignore
    reliability: Literal["A", "B", "C", "D"] = "A"
    notes: Optional[str] = None
    is_demo: bool = False


class SourceUpdateIn(BaseModel):
    name: Optional[str] = None
    authority: Optional[str] = None
    url: Optional[str] = None
    reliability: Optional[Literal["A", "B", "C", "D"]] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[Literal["active", "to_verify", "unreachable", "disabled"]] = None


class RegDocIn(BaseModel):
    source_id: str
    title: str = Field(min_length=2, max_length=300)
    url: Optional[str] = None
    country: str = Field(min_length=2, max_length=60)
    category: Optional[str] = None
    language: Optional[str] = "it"
    published_date: Optional[str] = None
    effective_date: Optional[str] = None
    content: str = Field(min_length=1, max_length=20000)
    is_demo: bool = False


class RegDocVersionIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    effective_date: Optional[str] = None
    note: Optional[str] = None


class RequirementIn(BaseModel):
    country: str = Field(min_length=2, max_length=60)
    market: Optional[str] = None
    category: str = Field(min_length=2, max_length=60)
    product_type: Optional[str] = None
    hs_code: Optional[str] = None
    ingredient: Optional[str] = None
    requirement_type: Literal[tuple(REQUIREMENT_TYPES)] = "OTHER"  # type: ignore
    description: str = Field(min_length=3, max_length=2000)
    severity: Literal["low", "medium", "high"] = "medium"
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    source_id: str
    document_id: Optional[str] = None
    is_demo: bool = False


class SourceReviewIn(BaseModel):
    action: Literal["approve", "reject"]
    note: Optional[str] = None


class MonitorIn(BaseModel):
    product_id: Optional[str] = None
    country: str = Field(min_length=2, max_length=60)
    category: Optional[str] = None
