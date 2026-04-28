"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  ExtractedIngredient,
  ExtractionErrorResponse,
  ExtractionResult,
  ExtractionSuccessResponse,
  IngredientConfidence,
} from "@/lib/extraction-types";

type AppState = "idle" | "loading" | "ready" | "error";

type CartLine = {
  id: string;
  name: string;
  packSize: string;
  category: string;
  quantity: number;
  price: number;
  confidence: IngredientConfidence;
};

const loadingSteps = [
  "Reading recipe context...",
  "Identifying shoppable ingredients...",
  "Building your Instamart basket...",
];

const confidenceStyle: Record<
  IngredientConfidence,
  { label: string; className: string }
> = {
  high: {
    label: "High confidence",
    className: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  },
  medium: {
    label: "Needs review",
    className: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  },
  low: {
    label: "Uncertain",
    className: "border-red-300/20 bg-red-300/10 text-red-100",
  },
};

const ingredientTones = [
  "from-orange-400 to-red-400",
  "from-emerald-400 to-lime-300",
  "from-amber-300 to-yellow-100",
  "from-fuchsia-400 to-purple-300",
  "from-sky-300 to-cyan-100",
  "from-rose-300 to-orange-200",
];

function IngredientAvatar({
  item,
  index,
}: {
  item: ExtractedIngredient;
  index: number;
}) {
  const initials =
    item.name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "IN";

  return (
    <div
      className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${
        ingredientTones[index % ingredientTones.length]
      } shadow-lg shadow-black/20`}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-white/25" />
      <span className="relative text-sm font-black tracking-tight text-black/70">
        {initials}
      </span>
    </div>
  );
}

function formatPlatform(platform: ExtractionResult["platform"]) {
  return platform === "youtube" ? "YouTube / Shorts" : "Instagram Reel";
}

function buildCopyText(result: ExtractionResult) {
  return [
    `Dish: ${result.dish}`,
    `Cuisine: ${result.cuisine}`,
    `Servings: ${result.servings}`,
    "",
    "Ingredients:",
    ...result.ingredients.map(
      (item) =>
        `- ${item.name}: ${item.quantity}${
          item.preparation !== "Not specified" ? `, ${item.preparation}` : ""
        }`,
    ),
  ].join("\n");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferPackSize(item: ExtractedIngredient) {
  const quantity = item.quantity.toLowerCase();

  if (quantity && quantity !== "not specified" && quantity !== "unknown") {
    return item.quantity;
  }

  const name = item.name.toLowerCase();

  if (name.includes("chicken") || name.includes("paneer")) {
    return "500g";
  }

  if (name.includes("cream") || name.includes("curd") || name.includes("yogurt")) {
    return "200g";
  }

  if (name.includes("rice") || name.includes("flour")) {
    return "1kg";
  }

  if (item.category.toLowerCase().includes("spice")) {
    return "100g";
  }

  return "1 pack";
}

function inferPrice(item: ExtractedIngredient) {
  const name = item.name.toLowerCase();
  const category = item.category.toLowerCase();

  if (name.includes("chicken")) return 240;
  if (name.includes("paneer")) return 120;
  if (name.includes("butter")) return 65;
  if (name.includes("cream")) return 85;
  if (name.includes("curd") || name.includes("yogurt")) return 70;
  if (name.includes("rice")) return 160;
  if (name.includes("cashew")) return 140;
  if (category.includes("spice")) return 75;
  if (category.includes("produce") || category.includes("fruit")) return 40;
  if (category.includes("oil")) return 145;
  if (category.includes("dairy")) return 85;
  if (category.includes("meat")) return 240;

  return 60;
}

function buildCartLines(result: ExtractionResult | null): CartLine[] {
  if (!result) {
    return [];
  }

  return result.ingredients.map((item, index) => ({
    id: `${item.name}-${index}`,
    name: titleCase(item.name),
    packSize: inferPackSize(item),
    category: titleCase(item.category || "Pantry"),
    quantity: 1,
    price: inferPrice(item),
    confidence: item.confidence,
  }));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Home() {
  const [videoUrl, setVideoUrl] = useState("");
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copy ingredient list");

  const ingredientCount = result?.ingredients.length ?? 0;
  const cartLines = useMemo(() => buildCartLines(result), [result]);
  const cartTotal = useMemo(
    () => cartLines.reduce((total, item) => total + item.price * item.quantity, 0),
    [cartLines],
  );
  const highConfidenceCount = useMemo(
    () =>
      result?.ingredients.filter((item) => item.confidence === "high").length ??
      0,
    [result],
  );

  useEffect(() => {
    if (appState !== "loading") {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveStep((currentStep) => (currentStep + 1) % loadingSteps.length);
    }, 1300);

    return () => window.clearInterval(interval);
  }, [appState]);

  async function generateIngredients(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!videoUrl.trim()) {
      setAppState("error");
      setErrorMessage("Paste a YouTube video, YouTube Shorts, or Instagram Reel link.");
      setErrorDetail("");
      return;
    }

    setAppState("loading");
    setActiveStep(0);
    setResult(null);
    setErrorMessage("");
    setErrorDetail("");
    setCopyLabel("Copy ingredient list");

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: videoUrl }),
      });
      const payload = (await response.json()) as
        | ExtractionSuccessResponse
        | ExtractionErrorResponse;

      if (!response.ok || "error" in payload) {
        const apiError =
          "error" in payload
            ? payload.error
            : {
                message: "Extraction failed.",
                detail: "The server did not return a usable response.",
              };

        setAppState("error");
        setErrorMessage(apiError.message);
        setErrorDetail(apiError.detail ?? "");
        return;
      }

      setResult(payload.result);
      setAppState("ready");
    } catch (error) {
      setAppState("error");
      setErrorMessage("Could not reach the extraction service.");
      setErrorDetail(
        error instanceof Error
          ? error.message
          : "Check that the Next.js server is running.",
      );
    }
  }

  async function copyIngredients() {
    if (!result) {
      return;
    }

    const text = buildCopyText(result);
    setCopyLabel("Copied");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }

    } catch {
      try {
        fallbackCopy(text);
      } catch {
        setCopyLabel("Copy failed");
      }
    } finally {
      window.setTimeout(() => setCopyLabel("Copy ingredient list"), 1500);
    }
  }

  function resetFlow() {
    setVideoUrl("");
    setAppState("idle");
    setResult(null);
    setErrorMessage("");
    setErrorDetail("");
    setActiveStep(0);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-12%] h-96 w-96 rounded-full bg-orange-500/20 blur-3xl animate-soft-pulse" />
        <div className="absolute right-[-8%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-[-18%] left-[35%] h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_top,black,transparent_70%)]" />
      </div>

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl animate-fade-up">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-red-500 shadow-lg shadow-orange-500/25">
              <span className="text-lg font-black">C</span>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">ClipCart</p>
              <p className="text-xs text-white/45">Recipe clips to Instamart baskets</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Built for Swiggy Builders Club
          </div>
        </header>

        <div className="grid flex-1 items-start gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <section className="animate-fade-up [animation-delay:80ms] lg:sticky lg:top-28 lg:self-start">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/70 shadow-xl shadow-black/20 backdrop-blur-xl">
              <span className="rounded-full bg-orange-400/20 px-2 py-0.5 text-xs font-semibold text-orange-200">
                Swiggy-ready concept
              </span>
              YouTube, Shorts, Reels to grocery baskets.
            </div>

            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.05em] text-white sm:text-6xl sm:tracking-[-0.08em] lg:text-7xl">
              Turn recipe clips into
              <span className="block bg-gradient-to-r from-orange-200 via-white to-emerald-200 bg-clip-text text-transparent">
                an Instamart-ready basket.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/62">
              ClipCart reads cooking videos, extracts the ingredients, and
              shapes them into a clean draft cart that feels native to quick
              commerce.
            </p>

            <form
              onSubmit={generateIngredients}
              className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.06] p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="video-url">
                  Paste a YouTube, Shorts, or Reel link
                </label>
                <input
                  id="video-url"
                  value={videoUrl}
                  onChange={(event) => setVideoUrl(event.target.value)}
                  placeholder="Paste a YouTube, Shorts, or Reel link"
                  className="min-h-14 flex-1 rounded-[1.5rem] border border-white/10 bg-black/30 px-5 text-base text-white outline-none transition placeholder:text-white/35 focus:border-orange-300/40 focus:bg-black/45 focus:ring-4 focus:ring-orange-400/10"
                />
                <button
                  type="submit"
                  disabled={appState === "loading"}
                  className="min-h-14 rounded-[1.5rem] bg-gradient-to-r from-orange-400 to-red-500 px-6 font-semibold text-white shadow-xl shadow-orange-500/25 transition hover:scale-[1.01] hover:shadow-orange-500/35 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {appState === "loading" ? "Building basket..." : "Build Basket"}
                </button>
              </div>
            </form>

            {appState === "error" ? (
              <div className="mt-4 rounded-3xl border border-red-300/20 bg-red-300/10 p-4 text-sm text-red-100">
                <p className="font-semibold">{errorMessage}</p>
                {errorDetail ? (
                  <p className="mt-1 text-red-100/70">{errorDetail}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-7 grid max-w-xl gap-3 text-sm text-white/60 sm:grid-cols-3">
              {[
                "Real video extraction",
                "Draft grocery basket",
                "MCP-ready checkout",
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center backdrop-blur-xl"
                >
                  {label}
                </div>
              ))}
            </div>
          </section>

          <section className="animate-fade-up [animation-delay:180ms] lg:self-start">
            <div className="relative rounded-[2.25rem] border border-white/10 bg-[#10100f]/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-5">
              <div className="absolute -inset-px rounded-[2.25rem] bg-gradient-to-br from-white/18 via-transparent to-orange-400/20 opacity-70" />
              <div className="relative overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/35">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/35">
                      Detected dish
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      {result?.dish ?? "Waiting for source"}
                    </h2>
                  </div>
                  <div
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                      result
                        ? confidenceStyle[result.confidence].className
                        : "border-white/10 bg-white text-black"
                    }`}
                  >
                    {result ? result.confidence : "AI"}
                  </div>
                </div>

                {appState === "loading" ? (
                  <div className="p-5">
                    <div className="relative mb-5 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-r from-orange-300 to-red-400 animate-scan" />
                    </div>
                    <div className="space-y-3">
                      {loadingSteps.map((step, index) => {
                        const isActive = index === activeStep;

                        return (
                          <div
                            key={step}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                              isActive
                                ? "border-orange-300/25 bg-orange-300/10 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/35"
                            }`}
                          >
                            <span
                              className={`grid size-7 place-items-center rounded-full text-xs ${
                                isActive
                                  ? "bg-orange-300 text-black"
                                  : "bg-white/10 text-white/45"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <span className="font-medium">{step}</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-4 text-sm text-white/45">
                      Instagram Reels can take longer because public Reel
                      context is resolved before cart matching.
                    </p>
                  </div>
                ) : result ? (
                  <>
                    <div className="border-b border-white/10 p-5">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white/60">
                          {formatPlatform(result.platform)}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white/60">
                          {result.cuisine}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-white/60">
                          Serves {result.servings}
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-white/60">
                        {result.summary}
                      </p>
                    </div>

                    <div className="border-b border-white/10 p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-white/35">
                            Extracted ingredients
                          </p>
                          <p className="mt-1 text-sm text-white/50">
                            Source-backed ingredients before cart matching.
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/60">
                          {ingredientCount} items
                        </span>
                      </div>

                      <div className="space-y-3">
                        {result.ingredients.map((item, index) => (
                          <article
                            key={`${item.name}-${index}`}
                            className="group rounded-3xl border border-white/10 bg-white/[0.055] p-3 transition hover:border-white/20 hover:bg-white/[0.08]"
                          >
                            <div className="flex items-start gap-3">
                              <IngredientAvatar item={item} index={index} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="font-semibold text-white">
                                      {item.name}
                                    </p>
                                    <p className="mt-1 text-sm text-white/45">
                                      {item.quantity}
                                      {item.preparation !== "Not specified"
                                        ? ` • ${item.preparation}`
                                        : ""}
                                    </p>
                                  </div>
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                      confidenceStyle[item.confidence].className
                                    }`}
                                  >
                                    {confidenceStyle[item.confidence].label}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm leading-5 text-white/50">
                                  {titleCase(item.category)} match for the
                                  suggested basket.
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-white/10 bg-[#0c0f14] p-4">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-white/35">
                              Draft Instamart cart
                            </p>
                            <h3 className="mt-2 text-2xl font-semibold">
                              {formatPrice(cartTotal)}
                            </h3>
                            <p className="mt-1 text-sm text-white/45">
                              {cartLines.length} matched products, ready for MCP checkout.
                            </p>
                          </div>
                          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">
                            18-24 min ETA
                          </span>
                        </div>

                        <div className="mt-4 space-y-2">
                          {cartLines.slice(0, 5).map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white/85">
                                  {item.name}
                                  <span className="ml-2 text-white/35">
                                    ({item.packSize})
                                  </span>
                                </p>
                                <p className="mt-0.5 text-xs text-white/35">
                                  {item.category}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-semibold">
                                  {formatPrice(item.price)}
                                </p>
                                <p className="text-xs text-white/35">x1</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {cartLines.length > 5 ? (
                          <p className="mt-3 text-sm text-white/45">
                            +{cartLines.length - 5} more products in the basket
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="border-t border-white/10 bg-black/30 p-5">
                      <div className="mb-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3">
                          <p className="text-xs text-white/40">Extracted</p>
                          <p className="mt-1 text-lg font-semibold">
                            {ingredientCount} ingredients
                          </p>
                        </div>
                        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/10 p-3">
                          <p className="text-xs text-emerald-100/60">
                            Confidence
                          </p>
                          <p className="mt-1 text-lg font-semibold text-emerald-100">
                            {highConfidenceCount}/{ingredientCount} high
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3">
                          <p className="text-xs text-amber-100/60">Review</p>
                          <p className="mt-1 text-lg font-semibold text-amber-100">
                            {result.uncertainItems.length} items
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            disabled
                            className="cursor-not-allowed rounded-3xl border border-orange-300/25 bg-gradient-to-r from-orange-500/80 to-red-500/70 px-6 py-4 text-left font-bold text-white shadow-xl shadow-orange-500/15"
                          >
                            <span className="flex items-center gap-2">
                              <svg
                                aria-hidden="true"
                                className="size-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M16 11V8a4 4 0 0 0-8 0v3m-1 0h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
                                />
                              </svg>
                              Checkout on Instamart
                            </span>
                            <span className="mt-1 block text-sm font-medium text-white/75">
                              Requires Swiggy MCP access
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={copyIngredients}
                            className="rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-4 text-left font-bold text-white transition hover:bg-white/[0.1]"
                          >
                            {copyLabel}
                            <span className="mt-1 block text-sm font-medium text-white/75">
                              Shareable grocery list
                            </span>
                          </button>
                      </div>

                      <button
                        type="button"
                        onClick={resetFlow}
                        className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                      >
                        Analyze another video
                      </button>

                      {result.uncertainItems.length ||
                      result.missingContext.length ? (
                        <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3 text-sm text-amber-100/80">
                          {[...result.uncertainItems, ...result.missingContext]
                            .slice(0, 4)
                            .join(" • ")}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="p-5">
                    <div className="rounded-[1.6rem] border border-dashed border-white/15 bg-white/[0.035] p-5">
                      <div className="mb-5 flex items-center gap-3">
                        <div className="grid size-11 place-items-center rounded-2xl bg-orange-400/15 text-lg font-black text-orange-200">
                          AI
                        </div>
                        <div>
                          <p className="font-semibold">Ready for a real source</p>
                          <p className="text-sm text-white/45">
                            Paste a public cooking video to start extraction.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {[
                          "YouTube videos and Shorts are analyzed by Gemini",
                          "Public Instagram Reels use transcript extraction first",
                          "Low-signal sources return a warning, not fake items",
                        ].map((label) => (
                          <div
                            key={label}
                            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/55"
                          >
                            <span className="size-2 rounded-full bg-white/25" />
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
