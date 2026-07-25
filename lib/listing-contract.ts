import { z } from "zod";

// Portable snapshot of Friendly Map Tokyo's inbound contract:
// src/domain/accessCard.ts, SHA-256
// a2e3148a520501648f3a45926a8a94959045e94dd54b711219c5850b512f3676
// Verified 2026-07-25. Keep this module repo-local so a standalone clone can
// validate webhook payloads without a sibling checkout.
export const listingFeatureKeys = [
  "wheelchair_access",
  "stroller_access",
  "hearing_writing_support",
  "english_menu",
  "step_free",
  "wide_entrance",
  "movable_seating"
] as const;

const localizedTextSchema = z.object({
  ja: z.string().trim().min(1).max(240),
  en: z.string().trim().min(1).max(240)
});

const evidenceSchema = z.object({
  sourceType: z.enum([
    "owner_submission",
    "staff_statement",
    "on_site_observation",
    "public_document",
    "public_card"
  ]),
  sourceLabel: localizedTextSchema,
  observedAt: z.string().datetime(),
  url: z.string().url().optional()
});

const featureSchema = z.object({
  key: z.enum(listingFeatureKeys),
  status: z.enum(["confirmed", "unconfirmed", "not_available"]),
  detail: localizedTextSchema,
  evidence: evidenceSchema
});

export const listingAccessCardSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    name: localizedTextSchema,
    category: localizedTextSchema,
    address: localizedTextSchema,
    location: z.object({
      lat: z.number().min(35.4).max(35.95),
      lng: z.number().min(138.9).max(140.1)
    }),
    googleMapsUrl: z.string().url(),
    accessCards: z.object({
      ja: z.object({ summary: z.string().trim().min(1).max(320) }),
      en: z.object({ summary: z.string().trim().min(1).max(320) })
    }),
    features: z.array(featureSchema).min(1).max(listingFeatureKeys.length),
    lastReviewedAt: z.string().datetime()
  })
  .superRefine((card, context) => {
    const seen = new Set<string>();
    card.features.forEach((feature, index) => {
      if (seen.has(feature.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["features", index, "key"],
          message: `duplicate feature key: ${feature.key}`
        });
      }
      seen.add(feature.key);
    });
  });

export const listingPublishPayloadSchema = z
  .object({
    event: z.literal("access_card.published"),
    schemaVersion: z.literal(1),
    cardId: z.string().trim().min(1).max(120),
    publicUrl: z.string().url(),
    card: listingAccessCardSchema
  })
  .superRefine((payload, context) => {
    if (payload.card.id !== payload.cardId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["card", "id"],
        message: "card.id must match cardId"
      });
    }
  });
