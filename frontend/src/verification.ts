export const DOC_STATUS: Record<string, { it: string; en: string; tone: "neutral" | "info" | "warning" | "success" | "error" }> = {
  missing: { it: "Mancante", en: "Missing", tone: "neutral" },
  uploaded: { it: "Caricato", en: "Uploaded", tone: "info" },
  in_review: { it: "In revisione", en: "In review", tone: "warning" },
  approved: { it: "Approvato", en: "Approved", tone: "success" },
  rejected: { it: "Respinto", en: "Rejected", tone: "error" },
  expired: { it: "Scaduto", en: "Expired", tone: "error" },
};
