import crypto from "node:crypto";
import {
  type Kit,
  type Question,
  type Flashcard,
  type QuestionCategory,
  type CompanyBrief,
  type ResearchSourceFailed,
} from "@ai-interview-prep/shared";
import { normalizeJobDescription } from "../deterministic/jd-normalizer.js";
import { checkRequirementCoverage } from "../deterministic/coverage-checker.js";
import { allocateSchedule } from "../deterministic/scheduler.js";
import { validateKitStructure } from "../deterministic/structure-validator.js";
import { validateAndNormalizeUrl } from "../security/url-validator.js";
import { crawlCompanySite, type ResearchPage } from "../research/crawler.js";
import {
  researchPublicInterviewDiscussion,
  type PublicInterviewResearch,
} from "../research/discussion-search.js";
import {
  defaultLLMProvider,
  type LLMProvider,
  type GenerationContext,
} from "../ai/llm-client.js";
import {
  buildExtractRequirementsPrompt,
  ExtractedRoleOutputSchema,
  type ExtractedRoleOutput,
} from "../ai/prompts/extract-requirements.prompt.js";
import {
  buildCompanyBriefPrompt,
  CompanyBriefOutputSchema,
} from "../ai/prompts/company-brief.prompt.js";
import {
  buildCategoryQuestionsPrompt,
  CategoryQuestionsOutputSchema,
  type CategoryQuestionsOutput,
} from "../ai/prompts/generate-questions.prompt.js";
import {
  buildTargetedQuestionsPrompt,
  TargetedQuestionsOutputSchema,
  type TargetedQuestionsOutput,
} from "../ai/prompts/targeted-questions.prompt.js";
import {
  buildFlashcardsPrompt,
  FlashcardsOutputSchema,
  type FlashcardsOutput,
} from "../ai/prompts/generate-flashcards.prompt.js";
import { AppError } from "../middleware/error.middleware.js";
import { logger } from "../utils/logger.js";
import { createLimiter, type Limiter } from "../utils/limiter.js";
import { researchCacheRepository } from "../repositories/research-cache.repository.js";
import { sha256 } from "../utils/hash.js";
import { env } from "../config/env.js";

/**
 * Process-wide global LLM concurrency limiter across all pipeline generation jobs.
 */
export const globalPipelineLlmLimiter: Limiter = createLimiter(
  env.MAX_CONCURRENT_LLM_CALLS ?? env.LLM_CONCURRENCY ?? 2
);

export type PipelineStage =
  | "validation"
  | "extracting_requirements"
  | "crawling_company"
  | "researching_discussion"
  | "generating_brief"
  | "generating_questions"
  | "checking_coverage"
  | "generating_flashcards"
  | "building_schedule"
  | "validating_kit"
  | "completed"
  | "failed";

export type ProgressCallback = (
  stage: PipelineStage,
  progress: number,
  message: string
) => Promise<void> | void;

export interface GenerationInput {
  jd: string;
  company_url: string;
  days: number;
}

export interface PipelineOptions {
  llmProvider?: LLMProvider;
  onProgress?: ProgressCallback;
  maxCoveragePasses?: number;
  generationId?: string;
  maxGenerationTimeMs?: number;
  maxLlmCalls?: number;
  llmConcurrency?: number;
  llmLimiter?: Limiter;
  signal?: AbortSignal;
}

/**
 * Executes the complete interview preparation kit generation pipeline with:
 * - Parallel execution of independent research (company crawl || public discussion)
 * - Bounded parallel execution of category question generation
 * - Canonical deterministic question merging and sequential ID assignment
 * - Global generation deadline and LLM call budget enforcement
 * - Mandatory must-have coverage gate
 * - Comprehensive structured observability
 */
export async function runGenerationPipeline(
  input: GenerationInput,
  options: PipelineOptions = {}
): Promise<Kit> {
  const generationId = options.generationId || crypto.randomUUID();
  const maxGenerationTimeMs =
    options.maxGenerationTimeMs ?? env.MAX_GENERATION_TIME_MS ?? 120000;
  const deadline = Date.now() + maxGenerationTimeMs;
  const maxLlmCalls =
    options.maxLlmCalls ?? env.MAX_LLM_CALLS_PER_GENERATION ?? 12;
  const maxCoveragePasses =
    options.maxCoveragePasses ?? env.MAX_COVERAGE_PASSES ?? 2;

  let llmCallCount = 0;
  const llmContext: GenerationContext = {
    generationId,
    deadline,
    maxCalls: maxLlmCalls,
    get callCount() {
      return llmCallCount;
    },
    incrementCallCount() {
      llmCallCount++;
    },
    signal: options.signal,
  };

  const llm = options.llmProvider || defaultLLMProvider;
  const onProgress = options.onProgress || (() => {});
  // Use global API process-wide limiter unless overridden with custom instance or concurrency
  const llmLimiter =
    options.llmLimiter ??
    (options.llmConcurrency !== undefined
      ? createLimiter(options.llmConcurrency)
      : globalPipelineLlmLimiter);

  function checkAbort(): void {
    if (options.signal?.aborted) {
      throw new AppError(499, "GENERATION_CANCELLED", "Generation was cancelled");
    }
  }

  checkAbort();

  logger.info(
    {
      generationId,
      url: input.company_url,
      days: input.days,
      deadlineMs: maxGenerationTimeMs,
      maxCalls: maxLlmCalls,
    },
    "Starting production kit generation pipeline"
  );

  // --------------------------------------------------------------------------
  // Stage 0: Input Validation & Normalization
  // --------------------------------------------------------------------------
  await onProgress("validation", 5, "Validating input parameters");

  const urlValidation = validateAndNormalizeUrl(input.company_url);
  if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
    throw new AppError(
      400,
      "COMPANY_INVALID_URL",
      urlValidation.error || "Invalid company URL"
    );
  }

  const normalizedJd = normalizeJobDescription(input.jd);
  if (normalizedJd.charCount === 0) {
    throw new AppError(
      400,
      "JD_EMPTY",
      "Job description cannot be empty. Please provide a job posting."
    );
  }

  const daysAvailable = Math.min(60, Math.max(1, Math.floor(input.days)));

  // Derive initial company name guess from URL domain
  let companyName = "Company";
  try {
    const domainParts = new URL(urlValidation.normalizedUrl).hostname
      .replace(/^www\./, "")
      .split(".");
    if (domainParts.length > 0) {
      companyName =
        domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
  } catch {
    // fallback
  }

  // --------------------------------------------------------------------------
  // Stage 1: Requirement Extraction (LLM with Content-Addressed Cache)
  // --------------------------------------------------------------------------
  await onProgress(
    "extracting_requirements",
    15,
    "Extracting requirements from job description"
  );
  logger.info({ generationId }, "Pipeline stage 1: Requirement Extraction");

  const reqPrompt = buildExtractRequirementsPrompt(normalizedJd.text);
  const extractCacheKey = sha256(`llm_extract::${normalizedJd.text}::v1`);

  let roleOutput: ExtractedRoleOutput;
  const cachedExtract = await researchCacheRepository.get<ExtractedRoleOutput>(
    extractCacheKey
  );

  if (cachedExtract) {
    logger.info(
      { generationId, stage: "extracting_requirements", cacheHit: true },
      "Reusing cached requirement extraction"
    );
    roleOutput = cachedExtract;
  } else {
    checkAbort();
    roleOutput = await llmLimiter(() =>
      llm.generateStructured<ExtractedRoleOutput>(
        reqPrompt,
        ExtractedRoleOutputSchema,
        llmContext
      )
    );
    await researchCacheRepository.set(
      extractCacheKey,
      "llm_extract",
      roleOutput,
      24
    );
  }

  // --------------------------------------------------------------------------
  // Stage 2 & 3: Independent Company Crawl & Public Discussion Research (Parallel)
  // Phase 3A: Execute concurrently using Promise.allSettled()
  // --------------------------------------------------------------------------
  await onProgress(
    "crawling_company",
    30,
    `Researching company website and interview discussions (${companyName})`
  );
  logger.info(
    { generationId, url: urlValidation.normalizedUrl, companyName },
    "Pipeline stage 2 & 3: Concurrent Company Crawl & Public Discussion Research"
  );

  const researchStart = Date.now();
  const [crawlSettled, discussionSettled] = await Promise.allSettled([
    crawlCompanySite(urlValidation.normalizedUrl, {
      maxPages: 8,
      maxDepth: 2,
      concurrency: env.MAX_CONCURRENT_CRAWL_REQUESTS_PER_DOMAIN,
    }),
    researchPublicInterviewDiscussion(companyName),
  ]);

  logger.info(
    {
      generationId,
      stage: "research",
      durationMs: Date.now() - researchStart,
      crawlStatus: crawlSettled.status,
      discussionStatus: discussionSettled.status,
    },
    "Independent research phase completed in parallel"
  );

  let crawlPages: ResearchPage[] = [];
  const sourcesAttempted: string[] = [urlValidation.normalizedUrl];
  const sourcesUsed: string[] = [];
  const sourcesFailed: ResearchSourceFailed[] = [];
  let hiringPageFound = false;

  if (crawlSettled.status === "fulfilled") {
    const crawlResult = crawlSettled.value;
    crawlPages = crawlResult.pages;
    hiringPageFound = crawlResult.hiringPageFound;

    for (const p of crawlResult.pages) {
      sourcesUsed.push(p.url);
      if (!sourcesAttempted.includes(p.url)) {
        sourcesAttempted.push(p.url);
      }
    }

    for (const err of crawlResult.errors) {
      sourcesFailed.push({ url: err.url, reason: err.message });
      if (!sourcesAttempted.includes(err.url)) {
        sourcesAttempted.push(err.url);
      }
    }
  } else {
    logger.warn(
      { generationId, crawlErr: crawlSettled.reason },
      "Company crawl encountered non-fatal error; proceeding with available data"
    );
    sourcesFailed.push({
      url: urlValidation.normalizedUrl,
      reason: (crawlSettled.reason as Error)?.message || "Crawl failed",
    });
  }

  // Refine company name from page titles if available
  if (crawlPages.length > 0 && crawlPages[0].title) {
    const titleParts = crawlPages[0].title.split(/[-|–:]/);
    if (titleParts.length > 0 && titleParts[0].trim().length > 1) {
      companyName = titleParts[0].trim();
    }
  }

  let publicDiscussion: PublicInterviewResearch = {
    company: companyName,
    hasDiscussion: false,
    findings: [],
  };

  if (discussionSettled.status === "fulfilled") {
    publicDiscussion = discussionSettled.value;
    for (const f of publicDiscussion.findings) {
      if (f.url && !sourcesUsed.includes(f.url)) {
        sourcesUsed.push(f.url);
      }
    }
  } else {
    logger.warn(
      { generationId, searchErr: discussionSettled.reason },
      "Public discussion search failed non-fatally"
    );
    sourcesFailed.push({
      url: `Public Search (${companyName})`,
      reason:
        (discussionSettled.reason as Error)?.message ||
        "Public discussion search failed",
    });
  }

  // --------------------------------------------------------------------------
  // Stage 4: Company Brief Synthesis (LLM)
  // --------------------------------------------------------------------------
  await onProgress(
    "generating_brief",
    50,
    "Synthesizing company brief and culture insights"
  );
  logger.info({ generationId }, "Pipeline stage 4: Company Brief Synthesis");

  checkAbort();
  const briefPrompt = buildCompanyBriefPrompt(
    companyName,
    crawlPages,
    publicDiscussion.findings
  );
  const companyBrief = await llmLimiter(() =>
    llm.generateStructured<CompanyBrief>(
      briefPrompt,
      CompanyBriefOutputSchema,
      llmContext
    )
  );

  // Guarantee companyBrief has at least rootUrl in sources if none returned
  if (companyBrief.sources.length === 0) {
    companyBrief.sources = [urlValidation.normalizedUrl];
  }

  // If the JD was concise (thin-JD notice check preserved)
  if (
    normalizedJd.charCount < 180 &&
    !companyBrief.summary.includes("limited source information")
  ) {
    companyBrief.summary = `${companyBrief.summary} (Note: Prepared from a concise job posting with limited source information.)`;
  }

  // --------------------------------------------------------------------------
  // Stage 5: Category-Specific Question Generation (Bounded Concurrency & Deterministic Merge)
  // Phase 3B: Categories executed with bounded parallel limit (MAX_CONCURRENT_LLM_CALLS = 2)
  // --------------------------------------------------------------------------
  checkAbort();
  await onProgress(
    "generating_questions",
    65,
    "Generating categorized interview questions (bounded parallel)"
  );
  logger.info(
    { generationId },
    "Pipeline stage 5: Category-Specific Question Generation"
  );

  const categories: QuestionCategory[] = [
    "technical",
    "system-design",
    "behavioural",
    "company-fit",
  ];

  const categoryTasks = categories.map((category) => {
    // Select requirements most aligned with this category
    let categoryReqs = roleOutput.requirements;
    if (category === "technical") {
      categoryReqs = roleOutput.requirements.filter(
        (r) => r.kind === "technical" || r.kind === "domain"
      );
    } else if (category === "behavioural") {
      categoryReqs = roleOutput.requirements.filter(
        (r) => r.kind === "behavioural" || r.priority === "must"
      );
    } else if (category === "system-design") {
      categoryReqs = roleOutput.requirements.filter(
        (r) => r.kind === "technical"
      );
    }

    if (categoryReqs.length === 0) {
      categoryReqs = roleOutput.requirements;
    }

    const qPrompt = buildCategoryQuestionsPrompt({
      category,
      requirements: categoryReqs,
      roleTitle: roleOutput.title,
      seniority: roleOutput.seniority,
      companyName,
      companySummary: companyBrief.summary,
      startQuestionNumber: 1, // Final IDs will be assigned sequentially in deterministic merge
    });

    return llmLimiter(async () => {
      try {
        const qResult = await llm.generateStructured<CategoryQuestionsOutput>(
          qPrompt,
          CategoryQuestionsOutputSchema,
          llmContext
        );
        return { category, questions: qResult.questions };
      } catch (catErr) {
        logger.error(
          { generationId, category, catErr },
          "Failed generating category questions"
        );
        return { category, questions: [] };
      }
    });
  });

  const categoryResults = await Promise.all(categoryTasks);

  // --------------------------------------------------------------------------
  // Phase 16: Deterministic Merging
  // Strictly sort/merge results in canonical category order regardless of completion order
  // --------------------------------------------------------------------------
  const allQuestions: Question[] = [];
  let questionCounter = 1;

  for (const cat of categories) {
    const result = categoryResults.find((r) => r.category === cat);
    if (!result || result.questions.length === 0) continue;

    for (const q of result.questions) {
      // Enforce valid requirement reference check without fallback to arbitrary requirements
      const validReqIds = q.requirement_ids.filter((id) =>
        roleOutput.requirements.some((r) => r.id === id)
      );

      allQuestions.push({
        ...q,
        id: `q${questionCounter++}`,
        category: cat,
        requirement_ids: validReqIds,
      });
    }
  }

  // Handle 0-requirement edge case (e.g. 2-line minimal JD without explicit technical requirements)
  if (roleOutput.requirements.length === 0 && allQuestions.length === 0) {
    for (const cat of categories) {
      allQuestions.push({
        id: `q${questionCounter++}`,
        requirement_ids: [],
        category: cat,
        prompt: `Describe your technical experience and general problem-solving approach relevant to the ${roleOutput.seniority} ${roleOutput.title} position.`,
        answer_outline: `Present concrete project examples, architectural decisions, trade-offs made, and how you collaborate in an engineering team.`,
        difficulty: 2,
      });
    }
  }

  // Fallback: If no questions were generated due to provider issues, synthesize baseline questions
  if (allQuestions.length === 0 && roleOutput.requirements.length > 0) {
    roleOutput.requirements.forEach((req, idx) => {
      allQuestions.push({
        id: `q${idx + 1}`,
        requirement_ids: [req.id],
        category: req.kind === "behavioural" ? "behavioural" : "technical",
        prompt: `Explain your practical experience and depth regarding ${req.text}.`,
        answer_outline:
          "Discuss foundational principles, specific projects, trade-offs, and lessons learned.",
        difficulty: req.priority === "must" ? 2 : 1,
      });
    });
  }

  // --------------------------------------------------------------------------
  // Stage 6: Deterministic Coverage Checking & Targeted Second Pass (Sequential/Dependent)
  // Phase 3C: Second pass MUST remain strictly dependent on the first pass coverage result
  // --------------------------------------------------------------------------
  await onProgress(
    "checking_coverage",
    80,
    "Evaluating requirement coverage and closing gaps"
  );
  logger.info({ generationId }, "Pipeline stage 6: Deterministic Coverage Checking");

  let coveragePass = 1;
  let coverage = checkRequirementCoverage(
    roleOutput.requirements,
    allQuestions
  );

  while (!coverage.isMustCovered && coveragePass < maxCoveragePasses) {
    coveragePass++;
    logger.info(
      {
        generationId,
        pass: coveragePass,
        mustMissing: coverage.mustUncoveredRequirementIds,
      },
      "Closing coverage gaps with targeted second pass"
    );

    const missingReqs = roleOutput.requirements.filter((r) =>
      coverage.mustUncoveredRequirementIds.includes(r.id)
    );

    if (missingReqs.length === 0) break;

    const targetedPrompt = buildTargetedQuestionsPrompt({
      uncoveredRequirements: missingReqs,
      roleTitle: roleOutput.title,
      companyName,
      startQuestionNumber: questionCounter,
    });

    checkAbort();
    try {
      const targetedResult = await llmLimiter(() =>
        llm.generateStructured<TargetedQuestionsOutput>(
          targetedPrompt,
          TargetedQuestionsOutputSchema,
          llmContext
        )
      );

      for (const q of targetedResult.questions) {
        const validReqIds = q.requirement_ids.filter((id) =>
          roleOutput.requirements.some((r) => r.id === id)
        );
        allQuestions.push({
          ...q,
          id: `q${questionCounter++}`,
          requirement_ids: validReqIds,
        });
      }

      coverage = checkRequirementCoverage(
        roleOutput.requirements,
        allQuestions
      );
    } catch (targetedErr) {
      logger.warn(
        { generationId, targetedErr },
        "Targeted coverage generation encountered error"
      );
      break;
    }
  }

  // Mandatory Must-Have Coverage Gate (Phase 14): Kit fails if must-have requirements remain uncovered
  if (!coverage.isMustCovered) {
    logger.error(
      { generationId, uncovered: coverage.mustUncoveredRequirementIds },
      "Must-have requirements remain uncovered after all allowed passes"
    );
    throw new AppError(
      500,
      "MUST_REQUIREMENTS_UNCOVERED",
      `Unable to cover all must-have requirements after allowed generation passes (${maxCoveragePasses} passes). Uncovered: ${coverage.mustUncoveredRequirementIds.join(", ")}`,
      {
        uncoveredMustRequirements: coverage.mustUncoveredRequirementIds,
        passes: coveragePass,
      }
    );
  }

  // --------------------------------------------------------------------------
  // Stage 7: Flashcard Generation (LLM)
  // --------------------------------------------------------------------------
  checkAbort();
  await onProgress(
    "generating_flashcards",
    88,
    "Generating active-recall flashcards"
  );
  logger.info({ generationId }, "Pipeline stage 7: Flashcard Generation");

  let flashcards: Flashcard[] = [];
  try {
    const flashcardPrompt = buildFlashcardsPrompt({
      requirements: roleOutput.requirements,
      questions: allQuestions,
      companyName,
    });
    const flashcardResult = await llmLimiter(() =>
      llm.generateStructured<FlashcardsOutput>(
        flashcardPrompt,
        FlashcardsOutputSchema,
        llmContext
      )
    );
    flashcards = flashcardResult.flashcards.map((f, idx) => ({
      ...f,
      id: f.id || `f${idx + 1}`,
      requirement_ids: f.requirement_ids.filter((id) =>
        roleOutput.requirements.some((r) => r.id === id)
      ),
    }));
  } catch (flashErr) {
    logger.warn(
      { generationId, flashErr },
      "Flashcard generation fallback applied"
    );
    flashcards = allQuestions.slice(0, 6).map((q, idx) => ({
      id: `f${idx + 1}`,
      front: q.prompt,
      back: q.answer_outline,
      requirement_ids: q.requirement_ids,
    }));
  }

  // --------------------------------------------------------------------------
  // Stage 8: Deterministic Schedule Allocation
  // --------------------------------------------------------------------------
  checkAbort();
  await onProgress(
    "building_schedule",
    95,
    "Allocating deterministic study schedule"
  );
  logger.info(
    { generationId, daysAvailable },
    "Pipeline stage 8: Deterministic Schedule Allocation"
  );

  const schedule = allocateSchedule(
    daysAvailable,
    allQuestions,
    roleOutput.requirements
  );

  // --------------------------------------------------------------------------
  // Stage 9: Final Assembly & Structure Validation
  // --------------------------------------------------------------------------
  await onProgress(
    "validating_kit",
    98,
    "Validating kit structure and reference integrity"
  );
  logger.info({ generationId }, "Pipeline stage 9: Final Structure Validation");

  const pagesUsed = crawlPages.map((p) => p.url);
  if (pagesUsed.length === 0) {
    pagesUsed.push(urlValidation.normalizedUrl);
  }

  const finalKit: Kit = {
    source: {
      company: companyName,
      company_url: urlValidation.normalizedUrl,
      role: roleOutput.title,
      location: "",
      jd_chars: normalizedJd.charCount,
      researched_at: new Date().toISOString(),
      pages_used: pagesUsed,
    },
    company_brief: companyBrief,
    role: {
      title: roleOutput.title,
      seniority: roleOutput.seniority,
      responsibilities: roleOutput.responsibilities,
      requirements: roleOutput.requirements,
    },
    questions: allQuestions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncoveredRequirementIds,
      passes: coveragePass,
    },
    research: {
      sources_attempted: sourcesAttempted,
      sources_used: sourcesUsed.length > 0 ? sourcesUsed : pagesUsed,
      sources_failed: sourcesFailed,
      public_discussion: {
        found: publicDiscussion.hasDiscussion,
        sources: publicDiscussion.findings.map((f) => f.url),
      },
      hiring_page_found: hiringPageFound,
      pages_content: crawlPages.map((p) => ({
        url: p.url,
        title: p.title || "",
        content: p.text,
      })),
      discussion_content: publicDiscussion.findings.map((f) => ({
        source: f.url,
        snippet: f.snippet,
      })),
    },
  };

  // Enforce mandatory must-coverage in final validation
  const validation = validateKitStructure(finalKit, {
    requireMustCoverage: true,
  });
  if (!validation.isValid) {
    logger.error(
      { generationId, errors: validation.errors },
      "Generated kit failed structure validation"
    );
    throw new AppError(
      500,
      "KIT_VALIDATION_FAILED",
      `Kit validation failed: ${validation.errors.join("; ")}`
    );
  }

  await onProgress("completed", 100, "Interview preparation kit ready");
  logger.info(
    { generationId, llmCallsMade: llmCallCount },
    "Kit generation completed successfully"
  );

  return finalKit;
}
