from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

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
