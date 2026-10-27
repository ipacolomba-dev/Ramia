import React from "react";

import { AreaTabs } from "@/src/components/AreaTabs";

export default function LogisticsLayout() {
  return (
    <AreaTabs
      roles={["logistics"]}
      tabs={[
        { name: "spedizioni", label: ["Spedizioni", "Shipments"], icon: "cube" },
        { name: "preventivi", label: ["Preventivi", "Quotes"], icon: "pricetags" },
        { name: "tracciamento", label: ["Tracciamento", "Tracking"], icon: "navigate" },
        { name: "profilo", label: ["Profilo", "Profile"], icon: "person" },
      ]}
      hidden={["azienda"]}
    />
  );
}
