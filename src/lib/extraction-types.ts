export type SupportedPlatform = "youtube" | "instagram";

export type IngredientConfidence = "high" | "medium" | "low";

export type ExtractedIngredient = {
  name: string;
  quantity: string;
  preparation: string;
  category: string;
  confidence: IngredientConfidence;
  evidence: string;
};

export type ExtractionResult = {
  platform: SupportedPlatform;
  sourceUrl: string;
  dish: string;
  cuisine: string;
  servings: string;
  summary: string;
  ingredients: ExtractedIngredient[];
  uncertainItems: string[];
  missingContext: string[];
  confidence: IngredientConfidence;
  sourceEvidence: string[];
  analyzedAt: string;
};

export type ExtractionErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_PLATFORM"
  | "MISSING_GEMINI_KEY"
  | "MISSING_APIFY_TOKEN"
  | "PROVIDER_FAILED"
  | "LOW_SIGNAL"
  | "MODEL_FAILED";

export type ExtractionErrorResponse = {
  error: {
    code: ExtractionErrorCode;
    message: string;
    detail?: string;
  };
};

export type ExtractionSuccessResponse = {
  result: ExtractionResult;
};
