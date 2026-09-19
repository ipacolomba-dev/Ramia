import logging
import uuid
from datetime import timedelta

from db import db
from models import now_utc
from security import hash_password

logger = logging.getLogger(__name__)

IMG = "https://images.unsplash.com/photo-{pid}?auto=format&fit=crop&w=900&q=70"

P = {
    "olio_evo": "1601493700631-2b16ec4b4716",
    "olive": "1615485290382-441e4d049cb5",
    "pecorino": "1552767059-ce182ead6c1b",
    "ricotta": "1481931098730-318b6f776db0",
    "pistacchio": "1623428187969-5da2dcea5ebf",
    "mandorle": "1536520002442-39764a41e987",
    "arance": "1547514701-42782101795e",
    "limoni": "1550989460-0adf9ea622e2",
    "miele": "1587049352846-4a222e784d38",
    "pesto": "1592924357228-91a4daadcfea",
    "pasta": "1551183053-bf91a1d81141",
    "cannoli": "1749767138348-2e5bf1cbcef2",
    "vino": "1567072629554-20e689de2400",
    "capperi": "1595475207225-428b62bda831",
    "pane": "1509440159596-0249088772ff",
    "pesce": "1467003909585-2f8a72700288",
    "orto": "1512621776951-a57141f2eefd",
    "mercato": "1504674900247-0877df9cc836",
    "piatto": "1473093295043-cdd812d0e601",
    "tavola": "1498837167922-ddd27525d352",
}


async def seed():
    if await db.users.find_one({"email": "admin@saporidisicilia.it"}):
        return

    logger.info("Seeding demo data...")

    def mkuser(email, name, role, **kw):
        return {
            "_id": str(uuid.uuid4()), "email": email, "password_hash": hash_password("Demo1234!"),
            "name": name, "role": role, "locale": "it", "featured_until": None,
            "company_name": kw.get("company_name"), "region": kw.get("region"),
            "business_type": kw.get("business_type"), "specialty": kw.get("specialty"),
            "fleet_info": kw.get("fleet_info"), "created_at": now_utc(),
        }

    admin = {
        "_id": str(uuid.uuid4()), "email": "admin@saporidisicilia.it",
        "password_hash": hash_password("SaporiAdmin2026!"), "name": "Curatore",
        "role": "admin", "locale": "it", "featured_until": None, "company_name": "’Ra mia",
        "region": "Sicilia", "business_type": None, "specialty": None, "fleet_info": None,
        "created_at": now_utc(),
    }
    producer_demo = mkuser("produttore@demo.it", "Giovanni Gulì", "producer", company_name="Azienda Agricola Gulì", region="Val di Mazara, Palermo")
    producer2 = mkuser("frantoi@demo.it", "Carmelo Ibleo", "producer", company_name="Frantoi dei Monti Iblei", region="Ragusa")
    producer3 = mkuser("rocca@demo.it", "Rosario Capra", "producer", company_name="Rocca del Capra", region="Nebrodi, Messina")
    business = mkuser("business@demo.it", "EuroGourmet", "business", company_name="EuroGourmet GmbH", business_type="distributore", region="Monaco, Germania")
    collaborator = mkuser("consulente@demo.it", "Studio Etichette Export", "collaborator", specialty="Conformità etichette EU/USA")
    logistics = mkuser("logistica@demo.it", "SiciliaLogistica", "logistics", company_name="SiciliaLogistica Srl", region="Catania", fleet_info="20 furgoni, 8 isotermici, 2 groupage/sett verso Milano")
    consumer = mkuser("consumatore@demo.it", "Chiara Testa", "consumer")

    await db.users.insert_many([admin, producer_demo, producer2, producer3, business, collaborator, logistics, consumer])

    featured_until = now_utc() + timedelta(days=30)

    def mkproduct(producer, name, name_en, category, price, unit, stock, img, desc, desc_en, featured=False):
        return {
            "_id": str(uuid.uuid4()), "name": name, "name_en": name_en,
            "description": desc, "description_en": desc_en, "category": category,
            "price": price, "unit": unit, "stock": stock,
            "image_url": IMG.format(pid=img), "origin_region": producer["region"],
            "producer_id": producer["_id"], "producer_name": producer["name"],
            "company_name": producer.get("company_name") or producer["name"],
            "status": "approved", "featured_until": featured_until if featured else None,
            "created_at": now_utc(), "deleted_at": None,
        }

    products = [
        mkproduct(producer_demo, "Olio EVO Nocellara del Belice 750ml", "Nocillara del Belice EVO Oil 750ml", "olio", 14.90, "0,75 L", 40, P["olio_evo"],
                  "Olio extravergine premium da olive Nocillara del Belice, raccolte a mano e spreute a freddo entro 6 ore. Fruttato con note di carciofo e mandorla.",
                  "Premium extra virgin olive oil from hand-picked Nocillara del Belice olives, cold pressed within 6 hours. Fruity with artichoke and almond notes.", featured=True),
        mkproduct(producer_demo, "Miele di Arancio 500g", "Orange Blossom Honey 500g", "conserve", 11.50, "500 g", 60, P["miele"],
                  "Miele monocultivar dagli agrumeti in fiore della Piana di Catania. Delicato, profumato, cristallizzazione fine.",
                  "Monovarietal honey from the blooming citrus groves of the Catania plain. Delicate, fragrant, fine crystallization.", featured=True),
        mkproduct(producer_demo, "Pesto di Pistacchio di Bronte 190g", "Bronte Pistachio Pesto 190g", "conserve", 8.90, "190 g", 80, P["pesto"],
                  "Pesto cremoso con 50% di pistacchio di Bronte DOP, olio EVO e sale marino. Solo ingredienti siciliani.",
                  "Creamy pesto with 50% Bronte DOP pistachio, EVO oil and sea salt. Only Sicilian ingredients.", featured=True),
        mkproduct(producer_demo, "Mandorle Avola 250g", "Avola Almonds 250g", "frutta_secca", 6.50, "250 g", 100, P["mandorle"],
                  "Mandorle della varietà Pizzuta d'Avola, dolci e oleose, perfette da sole o per la pasticceria.",
                  "Pizzuta d'Avola variety almonds, sweet and oily, perfect on their own or for pastry.", featured=True),
        mkproduct(producer_demo, "Pane di Durumbatte", "Durum Wheat Bread", "pasta", 4.90, "1 kg", 25, P["pane"],
                  "Impasto a lievitazione naturale con grano duro siciliano macinato a pietra. Crosta croccante, mollica alveolata.",
                  "Naturally leavened dough with stone-milled Sicilian durum wheat. Crispy crust, open crumb."),
        mkproduct(producer2, "Olio EVO Monti Iblei DOP 500ml", "Monti Iblei DOP EVO Oil 500ml", "olio", 12.50, "0,5 L", 55, P["olive"],
                  "DOP Monti Iblei, cultivar Tonda Iblea. Erbaceo, con sentori di pomodoro verde e pepe finale.",
                  "DOP Monti Iblei, Tonda Iblea cultivar. Herbaceous, with green tomato notes and a peppery finish."),
        mkproduct(producer2, "Capperi di Pantelleria 180g", "Pantelleria Capers 180g", "conserve", 5.90, "180 g", 90, P["capperi"],
                  "Capperi IGP di Pantelleria sott'olio, ricchi di rutina e sali minerali. Intensi e profumati.",
                  "IGP Pantelleria capers in oil, rich in rutin and minerals. Intense and fragrant."),
        mkproduct(producer2, "Arance Tarocco Gallo 3kg", "Tarocco Gallo Oranges 3kg", "agrumi", 8.90, "3 kg", 120, P["arance"],
                  "Arance Tarocco Gallo dell'agro di Francofonte, coltivate senza trattamenti di post-raccolta. Dolci e succose.",
                  "Tarocco Gallo oranges from Francofonte, grown without post-harvest treatments. Sweet and juicy.", featured=True),
        mkproduct(producer2, "Limoni di Siracusa 2kg", "Siracusa Lemons 2kg", "agrumi", 6.90, "2 kg", 110, P["limoni"],
                  "Limone IGP di Siracusa, buccia spessa e profumatissima, raccolti su ordinazione.",
                  "IGP Siracusa lemons, thick and fragrant peel, picked to order."),
        mkproduct(producer3, "Pecorino Siciliano DOP 12 mesi", "Sicilian Pecorino DOP 12 months", "formaggi", 18.90, "kg", 30, P["pecorino"],
                  "Pecorino Siciliano DOP stagionato 12 mesi in grotta, da latte ovino crudo. Piccante, friabile, retrogusto di erba bruciata.",
                  "Sicilian Pecorino DOP cave-aged for 12 months, from raw sheep milk. Sharp, crumbly, burnt-grass finish.", featured=True),
        mkproduct(producer3, "Ricotta Salata DOP", "Ricotta Salata DOP", "formaggi", 12.00, "kg", 35, P["ricotta"],
                  "Ricotta di pecora salata e stagionata 90 giorni, la regina della pasta con le melanzane.",
                  "Salted, 90-day aged sheep ricotta, the queen of pasta alla Norma."),
        mkproduct(producer3, "Cannoli Kit (6 gusci + ricotta)", "Cannoli Kit (6 shells + ricotta)", "dolci", 15.90, "kit", 45, P["cannoli"],
                  "Gusci croccanti di Modica e ricotta di pecora fresca da gustare subito: la Sicilia in tavola.",
                  "Crunchy Modica shells and fresh sheep ricotta to enjoy right away: Sicily on your table."),
        mkproduct(producer3, "Nero d'Avola DOC 2021", "Nero d'Avola DOC 2021", "vino", 11.90, "0,75 L", 70, P["vino"],
                  "Vino rosso da uve Nero d'Avola, 12 mesi in botte grande. Frutti rossi, spezie dolci, tannino setoso.",
                  "Red wine from Nero d'Avola grapes, 12 months in large cask. Red fruit, sweet spice, silky tannins."),
        mkproduct(producer3, "Pasta di Grano Duro Trafilata al Bronzo 500g", "Bronze-Cut Durum Wheat Pasta 500g", "pasta", 3.90, "500 g", 200, P["pasta"],
                  "Gragnano-style pasta with Sicilian durum wheat, bronze-die cut and slow dried at low temperature.",
                  "Pasta tipo Gragnano con grano duro siciliano, trafilata al bronzo ed essiccata lentamente."),
    ]

    product_ids = [p["_id"] for p in products]
    await db.products.insert_many(products)

    packages = [
        {"_id": str(uuid.uuid4()), "name": "Piccolo Orto di Sicilia", "name_en": "Little Sicilian Garden",
         "description": "Olio EVO, pesto di pistacchio e capperi di Pantelleria: la dispensa dell'isola.", "description_en": "EVO oil, pistachio pesto and Pantelleria capers: the island's pantry.",
         "price": 29.90, "product_ids": [product_ids[0], product_ids[6], product_ids[2]], "image_url": IMG.format(pid=P["olio_evo"]), "active": True, "created_at": now_utc()},
        {"_id": str(uuid.uuid4()), "name": "Dolce Sicilia", "name_en": "Sweet Sicily",
         "description": "Cannoli, miele di arancio e pistacchio di Bronte per chiudere in bellezza.", "description_en": "Cannoli, orange honey and Bronte pistachio for a sweet ending.",
         "price": 33.90, "product_ids": [product_ids[11], product_ids[1], product_ids[2]], "image_url": IMG.format(pid=P["cannoli"]), "active": True, "created_at": now_utc()},
        {"_id": str(uuid.uuid4()), "name": "Sinfonia di Agrumi", "name_en": "Citrus Symphony",
         "description": "Tarocco, limoni di Siracusa e miele di arancio: la colazione mediterranea.", "description_en": "Tarocco oranges, Siracusa lemons and orange honey: the Mediterranean breakfast.",
         "price": 24.90, "product_ids": [product_ids[7], product_ids[8], product_ids[1]], "image_url": IMG.format(pid=P["arance"]), "active": True, "created_at": now_utc()},
    ]
    await db.packages.insert_many(packages)

    b2b_offers = [
        {"_id": str(uuid.uuid4()), "title": "Olio EVO Monti Iblei DOP — Taniche 5L", "description": "Olio DOP in taniche da 5L per ristorazione e GDO. Certificazioni complete, etichette export incluse.",
         "category": "olio", "moq": 100, "unit": "L", "unit_price": 9.60, "origin_region": "Ragusa", "available_until": None,
         "producer_id": producer2["_id"], "producer_name": producer2["name"], "company_name": producer2["company_name"], "status": "open", "created_at": now_utc()},
        {"_id": str(uuid.uuid4()), "title": "Pecorino Siciliano DOP — Cartoni 3kg", "description": "Forme da 3kg sottovuoto, stagionatura 12 mesi, lotti tracciati. Ideale per griglie export e affettati.",
         "category": "formaggi", "moq": 200, "unit": "kg", "unit_price": 13.20, "origin_region": "Nebrodi, Messina", "available_until": None,
         "producer_id": producer3["_id"], "producer_name": producer3["name"], "company_name": producer3["company_name"], "status": "open", "created_at": now_utc()},
        {"_id": str(uuid.uuid4()), "title": "Arance Tarocco Gallo — Pallet 300kg", "description": "Pallet da 300kg con calibratura 2-3-4, raccolta su ordinazione, catena del freddo garantita.",
         "category": "agrumi", "moq": 1500, "unit": "kg", "unit_price": 1.90, "origin_region": "Francofonte, Siracusa", "available_until": None,
         "producer_id": producer2["_id"], "producer_name": producer2["name"], "company_name": producer2["company_name"], "status": "open", "created_at": now_utc()},
    ]
    await db.b2b_offers.insert_many(b2b_offers)

    shipping_requests = [
        {"_id": str(uuid.uuid4()), "title": "Groupage Sicilia → Milano (frigo)", "cargo_type": "Agrumi + formaggi refrigerati",
         "origin": "Ragusa", "destination": "Milano", "ready_date": "2026-06-30", "weight_kg": 1200, "pallets": 6,
         "notes": "Cerchiamo partner per completare il furgone isotermico: fino a 4 posti pallet disponibili.", "shared": True,
         "creator_id": producer2["_id"], "creator_name": producer2["company_name"], "creator_role": "producer", "status": "open",
         "participants": [{"user_id": producer2["_id"], "name": producer2["company_name"], "role": "producer"}],
         "quotes": [{"id": str(uuid.uuid4()), "company_id": logistics["_id"], "company_name": logistics["company_name"], "price": 890.0, "transit_days": 2, "message": "Isotermico 18t, partenza martedì, carico condiviso con 2 spedizioni.", "created_at": now_utc().isoformat()}],
         "created_at": now_utc()},
        {"_id": str(uuid.uuid4()), "title": "Export pallet olio → Monaco di Baviera", "cargo_type": "Olio EVO in vetro (pallet filmati)",
         "origin": "Palermo", "destination": "Monaco di Baviera, DE", "ready_date": "2026-07-08", "weight_kg": 2400, "pallets": 8,
         "notes": "Cerchiamo altri produttori per riempire il trailer e ridurre il costo per pallet.", "shared": True,
         "creator_id": producer_demo["_id"], "creator_name": producer_demo["company_name"], "creator_role": "producer", "status": "open",
         "participants": [{"user_id": producer_demo["_id"], "name": producer_demo["company_name"], "role": "producer"}],
         "quotes": [], "created_at": now_utc()},
    ]
    await db.shipping_requests.insert_many(shipping_requests)

    label_request = {
        "_id": str(uuid.uuid4()), "producer_id": producer_demo["_id"], "producer_name": producer_demo["company_name"],
        "product_name": "Pesto di Pistacchio di Bronte 190g", "target_market": "USA", "image_url": IMG.format(pid=P["pesto"]),
        "needs": "Serve adeguamento etichetta per il mercato USA: Nutrition Facts FDA, ingredienti in inglese, Codice GTIN e detenzione FSVP.",
        "status": "open", "offers": [], "assigned_collaborator_id": None, "assigned_collaborator_name": None, "created_at": now_utc(),
    }
    await db.label_requests.insert_one(label_request)

    logger.info("Seed completato: %d prodotti, %d pacchetti, %d offerte B2B", len(products), len(packages), len(b2b_offers))
