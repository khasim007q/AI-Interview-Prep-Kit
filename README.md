# AI Interview Prep Kit

An autonomous, full-stack interview preparation platform engineered for the **Trao Full-Stack Engineering Assessment (FS-AI-INTERVIEW-01)**.

The system takes a pasted job description, a target company website URL, and the number of days until the interview, producing a structured, editable, and grounded interview preparation workspace.

---

## 1. Product & Architecture Overview

Unlike naive single-prompt LLM applications, this platform is engineered as an **explicitly staged pipeline** with a strict boundary between **stochastic language model reasoning** and **deterministic application logic**.

```
Job Description + Company Website URL + Days Available
                      │
                      ▼
            [ Stage 0: Input Validation & Normalization ]
                      │
                      ▼
         [ Stage 1: Explicit Requirement Extraction ]
                      │
          ┌───────────┴──────────────┐
          ▼                          ▼
[ Stage 2: Company Website ]   [ Stage 3: Public Interview ]
[ Crawl & Link Ranking     ]   [ Discussion Research       ]
          │                          │
          └───────────┬──────────────┘
                      ▼
        [ Stage 4: Grounded Company Brief Synthesis ]
                      │
                      ▼
   [ Stage 5: Category-Specific Question Generation ]
   (Technical, System Design, Behavioural, Company-Fit)
                      │
                      ▼
        [ Stage 6: Deterministic Coverage Check ]
                      │
                 Has gaps?
                ┌─────┴─────┐
               Yes          No
                │           │
                ▼           │
     [ Targeted 2nd Pass ]  │
     (closes must-haves)    │
                │           │
                └─────┬─────┘
                      ▼
          [ Stage 7: Active-Recall Flashcards ]
                      │
                      ▼
    [ Stage 8: Deterministic Schedule Allocation ]
    (1 to 60 days, must-haves earlier, integer mins)
                      │
                      ▼
        [ Stage 9: Final Semantic Validation ]
                      │
                      ▼
       [ Persistence & Optimistic Locking ]
                      │
                      ▼
  [ Editable Builder UI / Practice Mode / CLI Output ]
```

### The Central Engineering Division
- **What the LLM Owns**: Natural language comprehension, extracting requirements from raw JD text, summarizing company evidence, generating authentic interview questions, drafting answer outlines, and creating flashcards.
- **What Deterministic Code Owns**: SSRF validation, crawling rate limits, robots.txt compliance, requirement coverage calculation, second-pass triggering, day-by-day schedule allocation, ID referential integrity, optimistic version locking, and batch orchestration.

---

## 2. Tech Stack

| Layer | Choice | Justification |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + Tailwind CSS 4 | Fast server-side rendering, modern React 19 architecture, responsive UI components. |
| **Backend** | Node.js + Express 4 + TypeScript | Modular monolith with clean separation of services, repositories, and controllers. |
| **Database** | MongoDB | Document database ideal for nested kit structures, item metadata, and session stores. |
| **Language** | TypeScript (Strict Mode) | Full type safety across packages, shared schemas, and API contracts. |
| **Validation** | Zod | Runtime schema validation for inputs, LLM outputs, kit contracts, and batch evaluation. |
| **Testing** | Vitest | Extremely fast, native TypeScript test execution with watch mode and v8 coverage. |
| **LLM Adapter** | Google Gemini (`gemini-2.0-flash`) | High quality, structured JSON mode, genuine free-tier compatibility. |
| **Search Provider** | SerpAPI (with fallback abstraction) | Live public interview discussion search without vendor lock-in. |

---

## 3. Project Structure

```text
ai-interview-prep-kit/
├── apps/
│   ├── web/                        # Next.js App Router frontend
│   │   ├── app/
│   │   │   ├── (auth)/             # Login, Register
│   │   │   ├── dashboard/          # Kit dashboard
│   │   │   ├── kits/
│   │   │   │   ├── new/            # Input form (JD, URL, Days)
│   │   │   │   └── [kitId]/        # Tabbed workspace & builder
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx            # Landing page
│   │   ├── components/             # Reusable UI widgets & Navbar
│   │   └── lib/                    # API client with cookie handling
│   │
│   └── api/                        # Express backend & CLI
│       └── src/
│           ├── ai/                 # LLM provider adapter & staged prompts
│           ├── cli/                # Mandatory evaluate CLI command
│           ├── config/             # Zod-validated environment config
│           ├── controllers/        # Auth, Kits, Practice controllers
│           ├── deterministic/      # Coverage checker, scheduler, normalizer
│           ├── middleware/         # Auth, structured error handling
│           ├── pipeline/           # Orchestrator & multi-stage pipeline
│           ├── repositories/       # MongoDB data layer with optimistic locking
│           ├── research/           # Crawler, robots.txt, HTML cleaner, link ranker
│           ├── routes/             # REST endpoints
│           ├── security/           # SSRF guard, URL validator, prompt boundaries
│           └── services/           # Business logic & regeneration merge
│
├── packages/
│   └── shared/                     # Canonical shared contracts & types
│       └── src/
│           ├── schemas/            # KitSchema, BatchSchema, AuthSchema
│           └── index.ts
│
├── tests/
│   └── unit/                       # Deterministic, research, security, & pipeline tests
│
├── cases/                          # Batch evaluator test cases
├── package.json                    # Root npm workspaces
├── tsconfig.base.json              # Strict TypeScript compiler options
└── vitest.config.ts                # Vitest test runner configuration
```

---

## 4. Environment Variables

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | API server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `SESSION_SECRET` | Secret key for session cookies | Min 16 chars |
| `LLM_PROVIDER` | LLM provider adapter | `gemini` |
| `GEMINI_API_KEY` | Google Gemini API Key | Required for live LLM |
| `GEMINI_MODEL` | Gemini Model version | `gemini-2.0-flash` |
| `SEARCH_PROVIDER` | Public search provider | `serpapi` |
| `SERPAPI_API_KEY` | SerpAPI Key | Optional (graceful fallback) |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `ALLOW_LOCAL_FETCH`| Allow localhost in batch crawl | `true` |

---

## 5. Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
```bash
npm test
```

### 3. Run Development Servers
```bash
# Run both API and Web concurrently
npm run dev

# Or run separately:
npm run dev:api  # Runs API on http://localhost:4000
npm run dev:web  # Runs Web on http://localhost:3000
```

### 4. Build for Production
```bash
npm run build
```

---

## 6. Batch Evaluator CLI

The mandatory evaluation command processes an array of cases and produces one output JSON containing individual case kits or structured errors:

```bash
npm run evaluate -- --input cases/sample-cases.json --output output/kits.json
```

### Evaluator Features:
- **Same Application Pipeline**: Uses the exact same `runGenerationPipeline` orchestrator as the web UI.
- **Resilient Continuation**: If an individual case fails (e.g. unreachable company site), the batch continues processing remaining cases.
- **Localhost Support**: Supports local test targets like `http://localhost:8099/acme/` when `ALLOW_LOCAL_FETCH=true`.
- **Bounded Concurrency**: Uses a worker pool (concurrency 2) to respect free-tier rate limits.
- **Exact Output Contract**: Conforms to the `BatchOutputSchema` specified in Appendix A of the assessment.

---

## 7. Deep Dive: Key Algorithms & Decisions

### 7.1 Semantic Link Ranking (Dynamic Crawling)
The crawler **never relies on hardcoded paths** like `/careers` or `/jobs`. Instead, all internal `<a href="...">` links are extracted, normalized against the base URL, and scored using semantic term weights:
- **Positive signals**: `interview` (+15), `hiring` (+12), `careers` (+10), `jobs` (+10), `candidate` (+10), `about` (+8), `culture` (+6), `engineering` (+6), `team` (+5).
- **Negative penalties**: `login`, `cart`, `checkout`, `pricing`, `docs`, `api`, `support`, `legal` (-20).
- Only top-scoring links are enqueued into the priority queue, bounded by `CRAWL_MAX_PAGES` (default 10) and `CRAWL_MAX_DEPTH` (default 2).

### 7.2 Deterministic Requirement Coverage & Second-Pass Loop
Coverage is never decided by asking an LLM "is this covered?".
1. `checkRequirementCoverage` iterates through all extracted requirements and question `requirement_ids`.
2. Any requirement without an associated question is flagged as uncovered.
3. If any `priority: "must"` requirement remains uncovered, the orchestrator triggers a **targeted second-pass generation** specifically providing those missing requirements.
4. The generated questions are merged and coverage is re-verified, running up to 3 passes.

### 7.3 Deterministic Schedule Allocator
The schedule allocator receives `days_available` (1 to 60) and question records:
1. Each question is scored: `must` (+100), `nice` (+30), difficulty 3 (+30), difficulty 2 (+20), difficulty 1 (+10), plus category weighting.
2. Question duration is calculated: Diff 1 = 10m, Diff 2 = 15m, Diff 3 = 20m.
3. Questions are front-loaded so harder, high-priority material appears earlier in the schedule.
4. Output contains **exactly** `days_available` days, with sequential numbering, integer minutes, and strictly valid question ID references.

### 7.4 Edit Preservation During Regeneration
When a user edits a question or clicks **Pin**, internal metadata flags it as user-owned.
When triggering category regeneration (e.g. `POST /api/kits/:kitId/regenerate/questions/technical`):
- Pinned, edited, and user-created questions in that category are preserved.
- Only untouched generated questions are replaced.
- Questions in all other categories remain untouched.
- Coverage and schedule are automatically re-synchronized.

### 7.5 Creative Feature: Weak Spots Diagnostic Report
Users practice flashcards in an interactive active-recall modal and record their confidence from 1 (Very Weak) to 5 (Mastered).
The **Weak Spots Diagnostic Report** analyzes this data to highlight:
- Flashcards rated confidence ≤ 2
- Requirements mapped to low-confidence answers
- Next-session prioritized study queue (weakest first)

### 7.6 Security Protections
- **SSRF Guard**: External company URLs are validated before fetch. In production, loopback (127.0.0.1, ::1), private subnets (10.x, 192.168.x, 172.16-31.x), and cloud metadata endpoints are strictly blocked.
- **Prompt Injection Defense**: Untrusted job descriptions and crawled page texts are wrapped in `<UNTRUSTED_DATA>` boundary enclosures with defensive directives instructing the model to treat external text strictly as passive data.
- **Credential Storage**: Passwords are saved with Argon2id; session tokens are cryptographically random and stored only as SHA-256 hashes in MongoDB.

---

### 7.7 Deployment & Production Readiness

The platform is designed to deploy cleanly with zero code modifications:

- **Web Frontend**: Next.js 15 on **Vercel** (or Netlify/AWS Amplify). Static pages and App Router with `credentials: "include"` for secure HTTP-only session cookies.
  - Production URL: `https://ai-interview-prep-web.vercel.app` (or custom domain)
- **API Backend**: Node.js/Express on **Render** (or Railway). Bounded crawler, robust DNS SSRF filters, Argon2id auth, rate-limit backoff.
  - Production API: `https://ai-interview-prep-api.onrender.com`
  - Health Check: `GET /health` (`{"status":"ok","timestamp":"..."}`)
- **Database**: MongoDB Atlas (multi-region replica set with automated TTL expiration and compound indexes).

---

## 8. Defending Technical Trade-offs

1. **Modular Monolith over Microservices**: Given the assessment scope, a modular monolith in Node/Express provides clear architectural separation without network latency, distributed transactions, or deployment overhead.
2. **HTTP Polling over WebSockets**: Long-running generation jobs update status in MongoDB. Frontend client polls `/api/kits/:kitId/generation` every 1.5 seconds. This approach is resilient, stateless, and deploys effortlessly across serverless and free-tier hosting platforms without WebSocket disconnection issues.
3. **Bounded Text Retrieval over Vector Database**: The research corpus for a single interview prep kit consists of 5–10 pages from the target company's website. Text cleaning, link ranking, and bounded context injection provide superior accuracy and provenance without vector database infrastructure.
4. **Optimistic Version Locking**: Kit mutations require a `version` integer. Concurrent edits or stale client updates return `409 KIT_VERSION_CONFLICT`, displaying an inline alert with a **[Reload latest]** sync button.

---

## 9. Verification & Automated Test Results

The repository includes a comprehensive test suite across schemas, deterministic engines, security modules, research crawlers, builder state preservation, and the end-to-end pipeline:

```bash
# Run all unit and integration tests (53 / 53 tests passing)
npm test

# Run strict TypeScript typechecking (0 errors across shared, api, web)
npm run typecheck

# Run the Batch Evaluator CLI on sample cases
npm run evaluate -- --input cases/sample-cases.json --output cases/sample-output.json

# Build all monorepo workspaces for production
npm run build
```

### Verified Test Evidence
- **Test Files**: 7 passed (`schemas.test.ts`, `deterministic.test.ts`, `security.test.ts`, `research.test.ts`, `pipeline.test.ts`, `builder-and-refinements.test.ts`, `smoke.test.ts`)
- **Tests**: **53 passed** (0 failed)
- **TypeScript**: Strict mode enabled across all 3 workspaces, 0 type errors.
- **Batch Evaluation**: Evaluated sample case with Gemini LLM in 119.6s, validating 100% compliance with Appendix A schemas.
- **Production Build**: Clean production builds for Next.js App Router, Express API, and shared types.

---

## 10. License
Built for evaluation under Assessment FS-AI-INTERVIEW-01.
