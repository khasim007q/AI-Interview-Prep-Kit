import fs from "node:fs/promises";
import path from "node:path";
import {
  BatchInputSchema,
  type BatchCaseInput,
  type BatchOutput,
  type BatchCaseResult,
} from "@ai-interview-prep/shared";
import { runGenerationPipeline } from "../pipeline/orchestrator.js";
import { defaultLLMProvider } from "../ai/llm-client.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Parses CLI flags --input <file> and --output <file>
 */
function parseArgs(args: string[]): { inputPath?: string; outputPath?: string } {
  let inputPath: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && i + 1 < args.length) {
      inputPath = args[i + 1];
      i++;
    } else if (arg === "--output" && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }

  return { inputPath, outputPath };
}

/**
 * Processes a single batch case with resilient error containment.
 */
async function processCase(caseItem: BatchCaseInput): Promise<BatchCaseResult> {
  const startTime = Date.now();
  console.log(`[Batch] Starting case '${caseItem.id}' (${caseItem.company_url}, ${caseItem.days} days)...`);

  try {
    const kit = await runGenerationPipeline(
      {
        jd: caseItem.jd,
        company_url: caseItem.company_url,
        days: caseItem.days,
      },
      {
        llmProvider: defaultLLMProvider,
        onProgress: (_stage, progress, message) => {
          if (progress % 20 === 0 || progress === 100) {
            console.log(`[Batch - ${caseItem.id}] [${progress}%] ${message}`);
          }
        },
      }
    );

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Batch] ✓ Case '${caseItem.id}' succeeded in ${durationSec}s`);

    return {
      id: caseItem.id,
      status: "ok",
      kit,
      error: null,
    };
  } catch (err: unknown) {
    const appErr = err as AppError;
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Batch] ✗ Case '${caseItem.id}' failed after ${durationSec}s: ${appErr.message}`);

    return {
      id: caseItem.id,
      status: "failed",
      kit: null,
      error: {
        code: appErr.code || "PIPELINE_ERROR",
        message: appErr.message || "Case generation failed",
        details: appErr.details as Record<string, unknown> | undefined,
      },
    };
  }
}

/**
 * Processes cases with controlled bounded concurrency to prevent provider throttling.
 */
async function processWithConcurrency(
  cases: BatchCaseInput[],
  concurrency = 2
): Promise<BatchCaseResult[]> {
  const results: BatchCaseResult[] = new Array(cases.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < cases.length) {
      const idx = currentIndex++;
      results[idx] = await processCase(cases[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, cases.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

async function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));

  if (!inputPath || !outputPath) {
    console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
    process.exit(1);
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  console.log(`\n======================================================`);
  console.log(`  AI Interview Prep Kit — Batch Evaluator CLI`);
  console.log(`======================================================`);
  console.log(`Reading cases from:  ${resolvedInput}`);
  console.log(`Output destination:  ${resolvedOutput}`);

  let rawFileContent: string;
  try {
    rawFileContent = await fs.readFile(resolvedInput, "utf-8");
  } catch (err) {
    console.error(`Error: Could not read input file at '${resolvedInput}'`, err);
    process.exit(1);
  }

  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(rawFileContent);
  } catch {
    console.error(`Error: Input file '${resolvedInput}' is not valid JSON`);
    process.exit(1);
  }

  const validation = BatchInputSchema.safeParse(parsedInput);
  if (!validation.success) {
    console.error("Error: Input cases failed schema validation:", validation.error.format());
    process.exit(1);
  }

  const cases = validation.data;
  console.log(`Loaded ${cases.length} case(s). Beginning evaluation...\n`);

  const startTime = Date.now();
  const caseResults = await processWithConcurrency(cases, 2);
  const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  const batchOutput: BatchOutput = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: caseResults,
  };

  // Ensure target directory exists
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, JSON.stringify(batchOutput, null, 2), "utf-8");

  const successCount = caseResults.filter((r) => r.status === "ok").length;
  const failureCount = caseResults.filter((r) => r.status === "failed").length;

  console.log(`\n======================================================`);
  console.log(`  Evaluation Complete in ${totalDurationSec}s`);
  console.log(`  Total: ${cases.length} | Success: ${successCount} | Failed: ${failureCount}`);
  console.log(`  Results saved to: ${resolvedOutput}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  logger.error({ err }, "Fatal batch CLI error");
  console.error("Fatal error in batch evaluator:", err);
  process.exit(1);
});
