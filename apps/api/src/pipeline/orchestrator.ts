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
import { defaultLLMProvider, type LLMProvider } from "../ai/llm-client.js";
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
}

/**
 * Executes the complete 9-stage interview preparation kit generation pipeline.
 */
export async function runGenerationPipeline(
  input: GenerationInput,
  options: PipelineOptions = {}
): Promise<Kit> {
  const llm = options.llmProvider || defaultLLMProvider;
  const onProgress = options.onProgress || (() => {});
  const maxCoveragePasses = options.maxCoveragePasses ?? 3;

  logger.info({ url: input.company_url, days: input.days }, "Starting kit generation pipeline");

  // --------------------------------------------------------------------------
  // Stage 0: Input Validation & Normalization
  // --------------------------------------------------------------------------
  await onProgress("validation", 5, "Validating input parameters");

  const urlValidation = validateAndNormalizeUrl(input.company_url);
  if (!urlValidation.isValid || !urlValidation.normalizedUrl) {
    throw new AppError(400, "COMPANY_INVALID_URL", urlValidation.error || "Invalid company URL");
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
    const domainParts = new URL(urlValidation.normalizedUrl).hostname.replace(/^www\./, "").split(".");
    if (domainParts.length > 0) {
      companyName = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
    }
  } catch {
    // fallback
  }

  // --------------------------------------------------------------------------
  // Stage 1: Requirement Extraction (LLM)
  // --------------------------------------------------------------------------
  await onProgress("extracting_requirements", 15, "Extracting requirements from job description");
  logger.info("Pipeline stage 1: Requirement Extraction");

  const reqPrompt = buildExtractRequirementsPrompt(normalizedJd.text);
  const roleOutput = await llm.generateStructured<ExtractedRoleOutput>(
    reqPrompt,
    ExtractedRoleOutputSchema
  );

  // --------------------------------------------------------------------------
  // Stage 2: Company Research Crawl (Deterministic Crawler)
  // --------------------------------------------------------------------------
  await onProgress("crawling_company", 30, `Researching company website (${companyName})`);
  logger.info({ url: urlValidation.normalizedUrl }, "Pipeline stage 2: Company Website Crawl");

  let crawlPages: ResearchPage[] = [];
  const sourcesAttempted: string[] = [urlValidation.normalizedUrl];
  const sourcesUsed: string[] = [];
  const sourcesFailed: ResearchSourceFailed[] = [];
  let hiringPageFound = false;

  try {
    const crawlResult = await crawlCompanySite(urlValidation.normalizedUrl, {
      maxPages: 8,
      maxDepth: 2,
    });
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
  } catch (crawlErr) {
    logger.warn({ crawlErr }, "Company crawl encountered non-fatal error; proceeding with available data");
    sourcesFailed.push({
      url: urlValidation.normalizedUrl,
      reason: (crawlErr as Error).message || "Crawl failed",
    });
  }

  // Refine company name from page titles if available
  if (crawlPages.length > 0 && crawlPages[0].title) {
    const titleParts = crawlPages[0].title.split(/[-|–:]/);
    if (titleParts.length > 0 && titleParts[0].trim().length > 1) {
      companyName = titleParts[0].trim();
    }
  }

  // --------------------------------------------------------------------------
  // Stage 3: Public Interview Discussion Research
  // --------------------------------------------------------------------------
  await onProgress("researching_discussion", 45, "Searching public discussion of interview process");
  logger.info({ companyName }, "Pipeline stage 3: Public Interview Research");

  let publicDiscussion: PublicInterviewResearch = {
    company: companyName,
    hasDiscussion: false,
    findings: [],
  };
  try {
    publicDiscussion = await researchPublicInterviewDiscussion(companyName);
    for (const f of publicDiscussion.findings) {
      if (f.url && !sourcesUsed.includes(f.url)) {
        sourcesUsed.push(f.url);
      }
    }
  } catch (searchErr) {
    logger.warn({ searchErr }, "Public discussion search failed non-fatally");
    sourcesFailed.push({
      url: `Public Search (${companyName})`,
      reason: (searchErr as Error).message || "Public discussion search failed",
    });
  }

  // --------------------------------------------------------------------------
  // Stage 4: Company Brief Synthesis (LLM)
  // --------------------------------------------------------------------------
  await onProgress("generating_brief", 55, "Synthesizing company brief and culture insights");
  logger.info("Pipeline stage 4: Company Brief Synthesis");

  const briefPrompt = buildCompanyBriefPrompt(
    companyName,
    crawlPages,
    publicDiscussion.findings
  );
  let companyBrief = await llm.generateStructured<CompanyBrief>(
    briefPrompt,
    CompanyBriefOutputSchema
  );

  // Guarantee companyBrief has at least rootUrl in sources if none returned
  if (companyBrief.sources.length === 0) {
    companyBrief.sources = [urlValidation.normalizedUrl];
  }

  // If the JD was very short (e.g. 2 lines), ensure honest notice
  if (normalizedJd.charCount < 180 && !companyBrief.summary.includes("limited source information")) {
    companyBrief.summary = `${companyBrief.summary} (Note: Prepared from a concise job posting with limited source information.)`;
  }

  // --------------------------------------------------------------------------
  // Stage 5: Category-Specific Question Generation (LLM)
  // --------------------------------------------------------------------------
  await onProgress("generating_questions", 65, "Generating categorized interview questions");
  logger.info("Pipeline stage 5: Category-Specific Question Generation");

  const allQuestions: Question[] = [];
  const categories: QuestionCategory[] = [
    "technical",
    "system-design",
    "behavioural",
    "company-fit",
  ];

  let questionCounter = 1;

  for (const category of categories) {
    // Select requirements most aligned with this category
    let categoryReqs = roleOutput.requirements;
    if (category === "technical") {
      categoryReqs = roleOutput.requirements.filter((r) => r.kind === "technical" || r.kind === "domain");
    } else if (category === "behavioural") {
      categoryReqs = roleOutput.requirements.filter((r) => r.kind === "behavioural" || r.priority === "must");
    } else if (category === "system-design") {
      categoryReqs = roleOutput.requirements.filter((r) => r.kind === "technical");
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
      startQuestionNumber: questionCounter,
    });

    try {
      const qResult = await llm.generateStructured<CategoryQuestionsOutput>(
        qPrompt,
        CategoryQuestionsOutputSchema
      );
      for (const q of qResult.questions) {
        // Enforce valid requirement reference check
        const validReqIds = q.requirement_ids.filter((id) =>
          roleOutput.requirements.some((r) => r.id === id)
        );
        if (validReqIds.length === 0 && roleOutput.requirements.length > 0) {
          validReqIds.push(roleOutput.requirements[0].id);
        }

        allQuestions.push({
          ...q,
          id: `q${questionCounter++}`,
          category,
          requirement_ids: validReqIds,
        });
      }
    } catch (catErr) {
      logger.error({ category, catErr }, "Failed generating category questions");
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
        answer_outline: "Discuss foundational principles, specific projects, trade-offs, and lessons learned.",
        difficulty: req.priority === "must" ? 2 : 1,
      });
    });
  }

  // --------------------------------------------------------------------------
  // Stage 6: Deterministic Coverage Checking & Targeted Second Pass
  // --------------------------------------------------------------------------
  await onProgress("checking_coverage", 80, "Evaluating requirement coverage and closing gaps");
  logger.info("Pipeline stage 6: Deterministic Coverage Checking");

  let coveragePass = 1;
  let coverage = checkRequirementCoverage(roleOutput.requirements, allQuestions);

  while (!coverage.isMustCovered && coveragePass < maxCoveragePasses) {
    coveragePass++;
    logger.info(
      { pass: coveragePass, mustMissing: coverage.mustUncoveredRequirementIds },
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

    try {
      const targetedResult = await llm.generateStructured<TargetedQuestionsOutput>(
        targetedPrompt,
        TargetedQuestionsOutputSchema
      );

      for (const q of targetedResult.questions) {
        allQuestions.push({
          ...q,
          id: `q${questionCounter++}`,
        });
      }

      coverage = checkRequirementCoverage(roleOutput.requirements, allQuestions);
    } catch (targetedErr) {
      logger.warn({ targetedErr }, "Targeted coverage generation encountered error");
      break;
    }
  }

  // Mandatory Must-Have Coverage Gate: Kit fails if must-have requirements remain uncovered
  if (!coverage.isMustCovered) {
    logger.error(
      { uncovered: coverage.mustUncoveredRequirementIds },
      "Must-have requirements remain uncovered after all allowed passes"
    );
    throw new AppError(
      500,
      "MUST_REQUIREMENTS_UNCOVERED",
      `Unable to cover all must-have requirements after allowed generation passes (${maxCoveragePasses} passes). Uncovered: ${coverage.mustUncoveredRequirementIds.join(", ")}`
    );
  }

  // --------------------------------------------------------------------------
  // Stage 7: Flashcard Generation (LLM)
  // --------------------------------------------------------------------------
  await onProgress("generating_flashcards", 88, "Generating active-recall flashcards");
  logger.info("Pipeline stage 7: Flashcard Generation");

  let flashcards: Flashcard[] = [];
  try {
    const flashcardPrompt = buildFlashcardsPrompt({
      requirements: roleOutput.requirements,
      questions: allQuestions,
      companyName,
    });
    const flashcardResult = await llm.generateStructured<FlashcardsOutput>(
      flashcardPrompt,
      FlashcardsOutputSchema
    );
    flashcards = flashcardResult.flashcards;
  } catch (flashErr) {
    logger.warn({ flashErr }, "Flashcard generation fallback applied");
    // Generate deterministic flashcards from questions
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
  await onProgress("building_schedule", 95, "Allocating deterministic study schedule");
  logger.info({ daysAvailable }, "Pipeline stage 8: Deterministic Schedule Allocation");

  const schedule = allocateSchedule(daysAvailable, allQuestions, roleOutput.requirements);

  // --------------------------------------------------------------------------
  // Stage 9: Final Assembly & Structure Validation
  // --------------------------------------------------------------------------
  await onProgress("validating_kit", 98, "Validating kit structure and reference integrity");
  logger.info("Pipeline stage 9: Final Structure Validation");

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
  const validation = validateKitStructure(finalKit, { requireMustCoverage: true });
  if (!validation.isValid) {
    logger.error({ errors: validation.errors }, "Generated kit failed structure validation");
    throw new AppError(
      500,
      "KIT_VALIDATION_FAILED",
      `Kit validation failed: ${validation.errors.join("; ")}`
    );
  }

  await onProgress("completed", 100, "Interview preparation kit ready");
  logger.info("Kit generation completed successfully");

  return finalKit;
}
