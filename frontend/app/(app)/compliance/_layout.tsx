import React from "react";

import { AreaTabs } from "@/src/components/AreaTabs";

export default function ComplianceLayout() {
  return (
    <AreaTabs
      roles={["collaborator", "producer"]}
      tabs={[
        { name: "servizi", label: ["Servizi", "Services"], icon: "document-text" },
        { name: "documenti", label: ["Documenti", "Documents"], icon: "folder" },
        { name: "requisiti-mercato", label: ["Requisiti", "Requirements"], icon: "shield-checkmark", roles: ["producer"] },
        { name: "profilo", label: ["Profilo", "Profile"], icon: "person" },
      ]}
      hidden={["azienda"]}
    />
  );
}
