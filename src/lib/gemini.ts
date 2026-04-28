import {
  createPartFromText,
  createPartFromUri,
  GoogleGenAI,
  Type,
  type ContentListUnion,
  type GenerateContentConfig,
  type Schema,
} from "@google/genai";
import type {
  ExtractedIngredient,
  ExtractionResult,
  IngredientConfidence,
  SupportedPlatform,
} from "./extraction-types";

type GeminiExtractionPayload = {
  dish?: unknown;
  cuisine?: unknown;
  servings?: unknown;
  summary?: unknown;
  confidence?: unknown;
  ingredients?: unknown;
  uncertainItems?: unknown;
  missingContext?: unknown;
  sourceEvidence?: unknown;
};

const confidenceValues = ["high", "medium", "low"] as const;

const ingredientSchema: Schema = {
  type: Type.OBJECT,
  required: [
    "name",
    "quantity",
    "preparation",
    "category",
    "confidence",
    "evidence",
  ],
  properties: {
    name: {
      type: Type.STRING,
      description: "Canonical grocery ingredient name, not a finished dish.",
    },
    quantity: {
      type: Type.STRING,
      description:
        "Best estimated recipe quantity. Use 'to taste' or 'as needed' only when the source is genuinely vague.",
    },
    preparation: {
      type: Type.STRING,
      description: "Cut, chopped, paste, powder, whole, or other prep notes.",
    },
    category: {
      type: Type.STRING,
      description: "Produce, dairy, meat, spice, pantry, oil, garnish, etc.",
    },
    confidence: {
      type: Type.STRING,
      format: "enum",
      enum: [...confidenceValues],
    },
    evidence: {
      type: Type.STRING,
      description:
        "Short source-backed reason: spoken line, visible item, caption, or transcript phrase.",
    },
  },
};

const extractionSchema: Schema = {
  type: Type.OBJECT,
  required: [
    "dish",
    "cuisine",
    "servings",
    "summary",
    "confidence",
    "ingredients",
    "uncertainItems",
    "missingContext",
    "sourceEvidence",
  ],
  properties: {
    dish: { type: Type.STRING },
    cuisine: { type: Type.STRING },
    servings: { type: Type.STRING },
    summary: { type: Type.STRING },
    confidence: {
      type: Type.STRING,
      format: "enum",
      enum: [...confidenceValues],
    },
    ingredients: {
      type: Type.ARRAY,
      minItems: "1",
      items: ingredientSchema,
    },
    uncertainItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    missingContext: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    sourceEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Brief source observations used to infer the recipe.",
    },
  },
};

const baseInstruction = `You are ClipCart's recipe extraction engine.

Extract a grocery-ready ingredient list from the provided cooking video, captions, metadata, or transcript.

Rules:
- Be precise and conservative. Do not invent ingredients that are not spoken, captioned, visibly identifiable, or strongly implied by the cooking process.
- Merge duplicate ingredients into one canonical item.
- Infer reasonable quantities only when the source gives enough visual/audio context. Mark uncertain estimates as medium or low confidence.
- Include pantry basics only if they are explicitly shown, spoken, or necessary to complete the demonstrated recipe.
- Do not include cookware, serving dishes, packaging brands, or unrelated garnish unless used in the recipe.
- If the source is not a cooking recipe or lacks enough signal, return low confidence with missingContext explaining why.
- Return only JSON matching the schema.`;

function modelCandidates() {
  return [
    process.env.GEMINI_MODEL?.trim(),
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
  ].filter((model, index, models): model is string => {
    return Boolean(model) && models.indexOf(model) === index;
  });
}

function createClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

export async function extractFromYouTubeUrl({
  apiKey,
  sourceUrl,
}: {
  apiKey: string;
  sourceUrl: string;
}): Promise<GeminiExtractionPayload> {
  const ai = createClient(apiKey);
  const response = await generateContentWithFallback({
    ai,
    contents: [
      createPartFromUri(sourceUrl, "video/mp4"),
      createPartFromText(
        `${baseInstruction}\n\nAnalyze this public YouTube video or Short for recipe ingredients.`,
      ),
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: extractionSchema,
      temperature: 0.1,
    },
  });

  return parseGeminiJson(response.text);
}

export async function extractFromTranscript({
  apiKey,
  sourceUrl,
  transcript,
  metadata,
  sourceKind = "Instagram Reel transcript and metadata",
}: {
  apiKey: string;
  sourceUrl: string;
  transcript: string;
  metadata: Record<string, unknown>;
  sourceKind?: string;
}): Promise<GeminiExtractionPayload> {
  const ai = createClient(apiKey);
  const response = await generateContentWithFallback({
    ai,
    contents: [
      createPartFromText(`${baseInstruction}

Analyze this ${sourceKind} for recipe ingredients.

Source URL:
${sourceUrl}

Metadata:
${JSON.stringify(metadata, null, 2)}

Transcript:
${transcript}`),
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: extractionSchema,
      temperature: 0.1,
    },
  });

  return parseGeminiJson(response.text);
}

async function generateContentWithFallback({
  ai,
  contents,
  config,
}: {
  ai: GoogleGenAI;
  contents: ContentListUnion;
  config: GenerateContentConfig;
}) {
  let lastError: unknown;

  for (const model of modelCandidates()) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("MODEL_FAILED");
}

export function normalizeExtraction({
  payload,
  platform,
  sourceUrl,
}: {
  payload: GeminiExtractionPayload;
  platform: SupportedPlatform;
  sourceUrl: string;
}): ExtractionResult {
  const ingredients = normalizeIngredients(payload.ingredients);

  if (ingredients.length === 0) {
    throw new Error("LOW_SIGNAL");
  }

  const confidence = normalizeConfidence(payload.confidence);

  return {
    platform,
    sourceUrl,
    dish: normalizeString(payload.dish, "Unknown dish"),
    cuisine: normalizeString(payload.cuisine, "Unknown cuisine"),
    servings: normalizeString(payload.servings, "Not specified"),
    summary: normalizeString(
      payload.summary,
      "Ingredients were extracted from the provided cooking source.",
    ),
    ingredients,
    uncertainItems: normalizeStringArray(payload.uncertainItems),
    missingContext: normalizeStringArray(payload.missingContext),
    confidence,
    sourceEvidence: normalizeStringArray(payload.sourceEvidence).slice(0, 6),
    analyzedAt: new Date().toISOString(),
  };
}

function parseGeminiJson(text: string | undefined): GeminiExtractionPayload {
  if (!text) {
    throw new Error("MODEL_FAILED");
  }

  try {
    return JSON.parse(text) as GeminiExtractionPayload;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("MODEL_FAILED");
    }

    return JSON.parse(match[0]) as GeminiExtractionPayload;
  }
}

function normalizeIngredients(value: unknown): ExtractedIngredient[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ingredients = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = normalizeString(record.name, "");

      if (!name) {
        return null;
      }

      return {
        name,
        quantity: normalizeString(record.quantity, "Not specified"),
        preparation: normalizeString(record.preparation, "Not specified"),
        category: normalizeString(record.category, "Ingredient"),
        confidence: normalizeConfidence(record.confidence),
        evidence: normalizeString(record.evidence, "Source-backed extraction"),
      };
    })
    .filter((item): item is ExtractedIngredient => item !== null)
    .slice(0, 30);

  return mergeDuplicateIngredients(ingredients);
}

function mergeDuplicateIngredients(
  ingredients: ExtractedIngredient[],
): ExtractedIngredient[] {
  const merged = new Map<string, ExtractedIngredient>();

  for (const ingredient of ingredients) {
    const key = ingredient.name.toLowerCase();
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, ingredient);
      continue;
    }

    merged.set(key, {
      ...existing,
      quantity: mergeText(existing.quantity, ingredient.quantity),
      preparation: mergeText(existing.preparation, ingredient.preparation),
      confidence: mergeConfidence(existing.confidence, ingredient.confidence),
      evidence: mergeText(existing.evidence, ingredient.evidence),
    });
  }

  return Array.from(merged.values());
}

function mergeText(first: string, second: string): string {
  if (!second || first === second) {
    return first;
  }

  if (!first || first === "Not specified") {
    return second;
  }

  if (second === "Not specified") {
    return first;
  }

  return `${first} + ${second}`;
}

function mergeConfidence(
  first: IngredientConfidence,
  second: IngredientConfidence,
): IngredientConfidence {
  if (first === "low" || second === "low") {
    return "low";
  }

  if (first === "medium" || second === "medium") {
    return "medium";
  }

  return "high";
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeConfidence(value: unknown): IngredientConfidence {
  return confidenceValues.includes(value as IngredientConfidence)
    ? (value as IngredientConfidence)
    : "medium";
}
