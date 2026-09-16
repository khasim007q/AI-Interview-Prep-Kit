import type { Requirement, Question } from "@ai-interview-prep/shared";

export interface CoverageAnalysis {
  coveredRequirementIds: string[];
  uncoveredRequirementIds: string[];
  mustUncoveredRequirementIds: string[];
  isFullyCovered: boolean;
  isMustCovered: boolean;
  coverageRatio: number;
}

/**
 * Deterministically analyzes requirement coverage across generated questions.
 * 
 * Never asks the LLM for coverage. All calculations are strictly deterministic.
 * A requirement is considered covered if at least one question references its ID.
 */
export function checkRequirementCoverage(
  requirements: Requirement[],
  questions: Question[]
): CoverageAnalysis {
  const coveredSet = new Set<string>();

  for (const question of questions) {
    if (Array.isArray(question.requirement_ids)) {
      for (const reqId of question.requirement_ids) {
        coveredSet.add(reqId);
      }
    }
  }

  const coveredRequirementIds: string[] = [];
  const uncoveredRequirementIds: string[] = [];
  const mustUncoveredRequirementIds: string[] = [];

  for (const req of requirements) {
    if (coveredSet.has(req.id)) {
      coveredRequirementIds.push(req.id);
    } else {
      uncoveredRequirementIds.push(req.id);
      if (req.priority === "must") {
        mustUncoveredRequirementIds.push(req.id);
      }
    }
  }

  const total = requirements.length;
  const coverageRatio = total > 0 ? coveredRequirementIds.length / total : 1.0;

  return {
    coveredRequirementIds,
    uncoveredRequirementIds,
    mustUncoveredRequirementIds,
    isFullyCovered: uncoveredRequirementIds.length === 0,
    isMustCovered: mustUncoveredRequirementIds.length === 0,
    coverageRatio,
  };
}
