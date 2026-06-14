import type { Specialist } from "@/lib/types";
import { SPECIALISTS } from "@/lib/specialists-static";

// Instant-render fallback for the DASHBOARD surfaces (/specialists, dispatch
// panel). The roster is static — it mirrors data/specialists.json — so there's
// no reason to block the UI on /api/specialists, which is a slow cross-region
// round-trip for non-US users now that the broker lives in US-East. We render
// this immediately; SWR still revalidates in the background and swaps in any
// live per-tenant overrides the moment they arrive.
//
// Mapped from the marketing shape (MarketingSpecialist) to the live Specialist
// shape: blurb -> description; card_name/desc_card/icon are left empty so the
// card's `card_name || name` and `desc_card || description` fallbacks kick in.
export const STATIC_SPECIALISTS: Specialist[] = SPECIALISTS.map((m) => ({
  id: m.id,
  name: m.name,
  card_name: "",
  role: m.role,
  description: m.blurb,
  desc_card: "",
  voice: m.voice,
  icon: "",
  glyph: m.glyph,
  accent: m.accent,
  category: m.category,
}));
