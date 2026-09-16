import { KitSchema, type Kit } from "@ai-interview-prep/shared";

export interface StructureValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidationOptions {
  /**
   * If true, ensures all 'must' priority requirements are covered by at least one question.
   * Default: true.
   */
  requireMustCoverage?: boolean;
}

/**
 * Validates the complete semantic structure and reference integrity of an interview prep kit.
 *
 * Performs runtime checks that exceed raw JSON schema validation:
 * 1. Schema conformity (Zod)
 * 2. Uniqueness of requirement, question, and flashcard IDs
 * 3. Referential integrity:
 *    - question.requirement_ids -> requirement.id
 *    - flashcard.requirement_ids -> requirement.id
 *    - schedule.days.question_ids -> question.id
 * 4. Schedule structural rules:
 *    - days.length === days_available
 *    - days are sequential 1..N
 *    - minutes are non-negative integers
 * 5. Coverage integrity:
 *    - coverage.uncovered_requirement_ids -> requirement.id
 *    - if requireMustCoverage is set, guarantees no 'must' requirements are left uncovered
 */
export function validateKitStructure(
  kit: unknown,
  options: ValidationOptions = {}
): StructureValidationResult {
  const errors: string[] = [];
  const { requireMustCoverage = true } = options;

  // 1. Zod schema validation
  const parseResult = KitSchema.safeParse(kit);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`[Schema] ${issue.path.join(".")}: ${issue.message}`);
    }
    return {
      isValid: false,
      errors,
    };
  }

  const typedKit: Kit = parseResult.data;

  // 2. Uniqueness of Requirement IDs
  const reqIdSet = new Set<string>();
  const mustReqIdSet = new Set<string>();
  for (const req of typedKit.role.requirements) {
    if (reqIdSet.has(req.id)) {
      errors.push(`Duplicate requirement ID: '${req.id}'`);
    }
    reqIdSet.add(req.id);
    if (req.priority === "must") {
      mustReqIdSet.add(req.id);
    }
  }

  // 3. Uniqueness of Question IDs & Requirement Reference Check
  const questionIdSet = new Set<string>();
  const coveredReqIdSet = new Set<string>();

  for (const question of typedKit.questions) {
    if (questionIdSet.has(question.id)) {
      errors.push(`Duplicate question ID: '${question.id}'`);
    }
    questionIdSet.add(question.id);

    for (const reqId of question.requirement_ids) {
      if (!reqIdSet.has(reqId)) {
        errors.push(
          `Question '${question.id}' references non-existent requirement '${reqId}'`
        );
      } else {
        coveredReqIdSet.add(reqId);
      }
    }
  }

  // 4. Uniqueness of Flashcard IDs & Requirement Reference Check
  const flashcardIdSet = new Set<string>();
  for (const flashcard of typedKit.flashcards) {
    if (flashcardIdSet.has(flashcard.id)) {
      errors.push(`Duplicate flashcard ID: '${flashcard.id}'`);
    }
    flashcardIdSet.add(flashcard.id);

    for (const reqId of flashcard.requirement_ids) {
      if (!reqIdSet.has(reqId)) {
        errors.push(
          `Flashcard '${flashcard.id}' references non-existent requirement '${reqId}'`
        );
      }
    }
  }

  // 5. Schedule Integrity Checks
  if (typedKit.schedule.days.length !== typedKit.schedule.days_available) {
    errors.push(
      `Schedule days count (${typedKit.schedule.days.length}) does not match days_available (${typedKit.schedule.days_available})`
    );
  }

  typedKit.schedule.days.forEach((day, index) => {
    const expectedDayNumber = index + 1;
    if (day.day !== expectedDayNumber) {
      errors.push(
        `Schedule day at index ${index} has day number ${day.day}, expected ${expectedDayNumber}`
      );
    }

    if (!Number.isInteger(day.minutes) || day.minutes < 0) {
      errors.push(
        `Schedule day ${day.day} has invalid minutes: ${day.minutes} (must be non-negative integer)`
      );
    }

    for (const qId of day.question_ids) {
      if (!questionIdSet.has(qId)) {
        errors.push(
          `Schedule day ${day.day} references non-existent question ID '${qId}'`
        );
      }
    }
  });

  // 6. Coverage Integrity Checks
  for (const uncoveredId of typedKit.coverage.uncovered_requirement_ids) {
    if (!reqIdSet.has(uncoveredId)) {
      errors.push(
        `Coverage lists non-existent uncovered requirement ID '${uncoveredId}'`
      );
    }
  }

  // 7. Must-have Coverage Verification
  if (requireMustCoverage) {
    for (const mustReqId of mustReqIdSet) {
      if (!coveredReqIdSet.has(mustReqId)) {
        errors.push(
          `Must-have requirement '${mustReqId}' is not covered by any interview question`
        );
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
