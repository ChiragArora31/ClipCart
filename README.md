# ClipCart

ClipCart turns cooking videos into an Instamart-ready grocery basket.

People discover recipes on YouTube, Shorts, and Instagram Reels, but the next step is still manual: pause the video, find the ingredient list, guess quantities, search every item, and rebuild the basket from scratch. ClipCart compresses that entire flow into one product experience.

Paste a cooking video link, let the app extract the ingredients, review the suggested grocery list, and see a draft Instamart basket that is ready for checkout once Swiggy MCP access is available.

## Why this exists

Recipe discovery and grocery ordering are naturally connected, but they currently live in separate workflows. A user watches a recipe because they want to cook it. The most valuable next action is not saving the video, it is getting the ingredients delivered.

ClipCart explores that bridge:

- Creators and recipe videos become shoppable.
- Users avoid manual ingredient planning.
- Instamart becomes the natural continuation of food inspiration.
- Swiggy MCPs can power the final cart and checkout step.

The current MVP focuses on accurate ingredient extraction and a polished cart preview. Checkout is intentionally locked in the UI and marked as requiring Swiggy MCP access.

## What it does

- Accepts YouTube videos, YouTube Shorts, and public Instagram Reels.
- Uses Gemini to understand the recipe and extract grocery-ready ingredients.
- Uses an Instagram transcript provider for public Reel context.
- Falls back to YouTube description text if direct video understanding is unavailable.
- Shows the detected dish, serving context, extracted ingredients, confidence levels, and review notes.
- Builds a draft Instamart-style basket with product rows, pack sizes, estimated prices, subtotal, and delivery ETA.
- Provides a copyable ingredient list for the current non-MCP workflow.
- Presents a locked "Checkout on Instamart" CTA to clearly communicate the intended Swiggy MCP integration.

## Product direction

ClipCart is designed as a Swiggy Builders Club product idea, not a generic AI demo. The goal is to show how Swiggy's commerce infrastructure can sit directly inside recipe discovery moments.

With MCP access, the next version would:

- Search Instamart inventory for each extracted ingredient.
- Resolve pack sizes, substitutions, and availability by location.
- Add selected items to a real cart.
- Let users review and checkout through Swiggy's ecosystem.

## Tech stack

- Next.js App Router
- React
- Tailwind CSS
- Gemini API via `@google/genai`
- Apify-based Instagram transcript extraction

The app is intentionally lightweight: no database, no auth layer, and no unnecessary UI dependency stack.

## Getting started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in the required keys:

```bash
GEMINI_API_KEY=your_gemini_api_key
APIFY_TOKEN=your_apify_token_for_instagram_reels
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Extracts structured recipe ingredients from video, transcript, or description context. |
| `APIFY_TOKEN` | For Instagram | Fetches transcript context for public Instagram Reels. |
| `GEMINI_MODEL` | No | Overrides the default Gemini model. |
| `APIFY_INSTAGRAM_TRANSCRIPT_ACTOR` | No | Overrides the default Instagram transcript actor. |

Never commit `.env.local`. The repository includes `.env.example` only as a template.

## Current limitations

- Instamart checkout is not active yet because Swiggy MCP access is required.
- Instagram extraction depends on public Reel availability and transcript/caption access.
- Draft cart prices and pack sizes are estimated for the MVP experience; real values should come from Instamart APIs/MCPs.
- If a video lacks enough recipe signal, ClipCart reports uncertainty instead of inventing missing ingredients.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Repository

GitHub: [ChiragArora31/ClipCart](https://github.com/ChiragArora31/ClipCart)
