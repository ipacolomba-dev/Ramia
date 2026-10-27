import React from "react";

import { AreaTabs } from "@/src/components/AreaTabs";

export default function ProducerLayout() {
  return (
    <AreaTabs
      roles={["producer"]}
      tabs={[
        { name: "dashboard", label: ["Home", "Home"], icon: "grid" },
        { name: "catalogo", label: ["Catalogo", "Catalog"], icon: "leaf" },
        { name: "ordini", label: ["Ordini", "Orders"], icon: "receipt" },
        { name: "export", label: ["Export", "Export"], icon: "earth" },
        { name: "profilo", label: ["Profilo", "Profile"], icon: "person" },
      ]}
      hidden={["azienda", "offerte", "lotti", "etichette", "visibilita", "incassi", "spedizioni"]}
    />
  );
}
