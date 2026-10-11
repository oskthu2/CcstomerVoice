/** "Name, role, organisation" – shared by the wall, admin and the AI prompt. */
export function who(s: { author?: string; role?: string; organization?: string } | undefined, fallback = "Anonym besökare") {
  return [s?.author, s?.role, s?.organization].filter(Boolean).join(", ") || fallback;
}

/** Suggestions for the organisation field, so the same organisation is spelt the same way. */
export const ORGANIZATION_SUGGESTIONS = [
  "Region Blekinge", "Region Dalarna", "Region Gotland", "Region Gävleborg", "Region Halland", "Region Jämtland Härjedalen",
  "Region Jönköpings län", "Region Kalmar län", "Region Kronoberg", "Region Norrbotten", "Region Skåne", "Region Stockholm",
  "Region Sörmland", "Region Uppsala", "Region Värmland", "Region Västerbotten", "Region Västernorrland", "Region Västmanland",
  "Västra Götalandsregionen", "Region Örebro län", "Region Östergötland",
  "SKR", "Inera", "E-hälsomyndigheten", "Socialstyrelsen",
];
