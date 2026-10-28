import React from "react";

import { AreaTabs } from "@/src/components/AreaTabs";

export default function BuyerLayout() {
  return (
    <AreaTabs
      roles={["consumer", "business", "reseller"]}
      tabs={[
        { name: "mercato", label: ["Mercato", "Market"], icon: "storefront" },
        { name: "ricerca-ai", label: ["Ricerca AI", "AI search"], icon: "sparkles" },
        { name: "trattative", label: ["Trattative", "Deals"], icon: "briefcase", roles: ["business", "reseller"] },
        { name: "ordini", label: ["Ordini", "Orders"], icon: "receipt" },
        { name: "profilo", label: ["Profilo", "Profile"], icon: "person" },
      ]}
      hidden={["richieste", "checkout", "analisi", "azienda", "spedizioni"]}
    />
  );
}
