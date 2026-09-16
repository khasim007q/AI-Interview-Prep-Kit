import type {
  Requirement,
  Question,
  Schedule,
  ScheduleDay,
} from "@ai-interview-prep/shared";

interface ScoredQuestion {
  question: Question;
  score: number;
  durationMinutes: number;
  isMust: boolean;
}

/**
 * Calculates priority score and duration for a question.
 */
function scoreQuestion(
  question: Question,
  requirementMap: Map<string, Requirement>
): ScoredQuestion {
  let score = 0;
  let isMust = false;

  // Requirement priority score
  for (const reqId of question.requirement_ids) {
    const req = requirementMap.get(reqId);
    if (req) {
      if (req.priority === "must") {
        score += 100;
        isMust = true;
      } else {
        score += 30;
      }
    }
  }

  // Difficulty score
  if (question.difficulty === 3) score += 30;
  else if (question.difficulty === 2) score += 20;
  else if (question.difficulty === 1) score += 10;

  // Category bonus
  switch (question.category) {
    case "system-design":
      score += 10;
      break;
    case "technical":
      score += 8;
      break;
    case "behavioural":
      score += 5;
      break;
    case "company-fit":
      score += 5;
      break;
  }

  // Estimated duration in minutes
  let durationMinutes = 15;
  if (question.difficulty === 1) durationMinutes = 10;
  else if (question.difficulty === 2) durationMinutes = 15;
  else if (question.difficulty === 3) durationMinutes = 20;

  return { question, score, durationMinutes, isMust };
}

/**
 * Generates an appropriate focus title for a day based on its position,
 * total days available, and the categories of questions scheduled.
 */
function generateDayFocus(
  dayIndex: number,
  totalDays: number,
  questions: Question[]
): string {
  if (questions.length === 0) {
    if (dayIndex === totalDays - 1) {
      return "Final Preparation & Mindset Review";
    }
    if (dayIndex >= Math.floor(totalDays * 0.75)) {
      return "Mock Interview Simulation & Weak Spots Review";
    }
    return "Flashcard Review & Concept Reinforcement";
  }

  const categoryCounts = new Map<string, number>();
  for (const q of questions) {
    categoryCounts.set(q.category, (categoryCounts.get(q.category) || 0) + 1);
  }

  // Find dominant category
  let dominantCategory = "";
  let maxCount = 0;
  for (const [cat, count] of categoryCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = cat;
    }
  }

  if (totalDays === 1) {
    return "Comprehensive Full-Spectrum Interview Intensive";
  }

  if (dayIndex === 0) {
    return "Core Architecture & High-Priority Fundamentals";
  }

  if (dayIndex === totalDays - 1) {
    return "Final Company-Fit & Practice Simulation";
  }

  switch (dominantCategory) {
    case "system-design":
      return "System Design & Distributed Scalability";
    case "technical":
      return "Deep Dive Technical Problem Solving";
    case "behavioural":
      return "Behavioural Mastery & Leadership Scenarios";
    case "company-fit":
      return "Company Mission, Values & Culture Alignment";
    default:
      return `Targeted Preparation & Mastery (Day ${dayIndex + 1})`;
  }
}

/**
 * Deterministically allocates questions across exactly `days_available` days.
 * 
 * Rules:
 * - days.length === days_available
 * - Harder / high-priority / must-have material scheduled earlier
 * - All question IDs refer to existing questions
 * - Minutes are strictly non-negative integers
 */
export function allocateSchedule(
  daysAvailable: number,
  questions: Question[],
  requirements: Requirement[]
): Schedule {
  const safeDays = Math.max(1, Math.floor(daysAvailable));

  if (questions.length === 0) {
    // Edge case: no questions to schedule
    const emptyDays: ScheduleDay[] = [];
    for (let d = 1; d <= safeDays; d++) {
      emptyDays.push({
        day: d,
        focus: d === safeDays ? "Final Review" : `Study & Preparation (Day ${d})`,
        question_ids: [],
        minutes: 30, // baseline reading time
      });
    }
    return {
      days_available: safeDays,
      days: emptyDays,
    };
  }

  const reqMap = new Map<string, Requirement>();
  for (const req of requirements) {
    reqMap.set(req.id, req);
  }

  // Score and sort all questions
  const scoredQuestions = questions
    .map((q) => scoreQuestion(q, reqMap))
    .sort((a, b) => {
      // Must-have requirements first
      if (a.isMust !== b.isMust) {
        return a.isMust ? -1 : 1;
      }
      // Higher score first
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Higher difficulty first
      if (b.question.difficulty !== a.question.difficulty) {
        return b.question.difficulty - a.question.difficulty;
      }
      // Stable tie-breaker by ID
      return a.question.id.localeCompare(b.question.id);
    });

  // Prepare day buckets
  const dayBuckets: {
    questionIds: string[];
    questions: Question[];
    totalMinutes: number;
  }[] = Array.from({ length: safeDays }, () => ({
    questionIds: [],
    questions: [],
    totalMinutes: 0,
  }));

  if (safeDays === 1) {
    // Single-day intensive: all questions on Day 1
    for (const sq of scoredQuestions) {
      dayBuckets[0].questionIds.push(sq.question.id);
      dayBuckets[0].questions.push(sq.question);
      dayBuckets[0].totalMinutes += sq.durationMinutes;
    }
  } else {
    // Multi-day allocation strategy:
    // Determine active question distribution range (e.g. up to 75% of days, reserving later days for review)
    // If questions count is high compared to days, use all days
    const activeDaysCount = Math.min(safeDays, Math.max(1, Math.min(safeDays - 1, scoredQuestions.length)));

    // Distribute sorted questions front-loaded into available active days
    for (let i = 0; i < scoredQuestions.length; i++) {
      const sq = scoredQuestions[i];
      // Target bucket: front-loaded
      // Earlier items in the list go into earlier buckets
      let targetDayIndex: number;

      if (i < activeDaysCount) {
        // Guarantee each active day gets at least one of the top questions
        targetDayIndex = i;
      } else {
        // Find the least loaded day among the active days, with bias toward earlier days
        let minMinutes = Infinity;
        let bestDay = 0;
        for (let d = 0; d < activeDaysCount; d++) {
          // Weight earlier days slightly more favorably for load
          const effectiveLoad = dayBuckets[d].totalMinutes + d * 5;
          if (effectiveLoad < minMinutes) {
            minMinutes = effectiveLoad;
            bestDay = d;
          }
        }
        targetDayIndex = bestDay;
      }

      dayBuckets[targetDayIndex].questionIds.push(sq.question.id);
      dayBuckets[targetDayIndex].questions.push(sq.question);
      dayBuckets[targetDayIndex].totalMinutes += sq.durationMinutes;
    }
  }

  // Construct final schedule days
  const finalDays: ScheduleDay[] = dayBuckets.map((bucket, index) => {
    const dayNumber = index + 1;
    const focus = generateDayFocus(index, safeDays, bucket.questions);
    // Baseline minutes: if no questions, assign 30 mins for review; otherwise total question minutes
    const minutes = bucket.totalMinutes > 0 ? bucket.totalMinutes : 30;

    return {
      day: dayNumber,
      focus,
      question_ids: bucket.questionIds,
      minutes: Math.round(minutes),
    };
  });

  return {
    days_available: safeDays,
    days: finalDays,
  };
}
