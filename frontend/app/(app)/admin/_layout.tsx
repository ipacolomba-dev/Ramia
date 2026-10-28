import React from "react";

import { AreaTabs } from "@/src/components/AreaTabs";

export default function AdminLayout() {
  return (
    <AreaTabs
      roles={["admin"]}
      tabs={[
        { name: "dashboard", label: ["Home", "Home"], icon: "grid" },
        { name: "utenti", label: ["Utenti", "Users"], icon: "people" },
        { name: "regolatorio", label: ["Normativa", "Regulatory"], icon: "shield-checkmark" },
        { name: "moderazione", label: ["Moderazione", "Moderation"], icon: "flag" },
        { name: "profilo", label: ["Profilo", "Profile"], icon: "person" },
      ]}
      hidden={["categorie", "incassi", "regole", "audit", "pagamenti", "match"]}
    />
  );
}
