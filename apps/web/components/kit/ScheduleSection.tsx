"use client";

import { Calendar, RefreshCw, Loader2, Clock, CheckCircle2 } from "lucide-react";
import type { Schedule, Question } from "@ai-interview-prep/shared";

interface ScheduleSectionProps {
  schedule: Schedule;
  questions: Question[];
  onRegenerateSchedule: () => void;
  isRegeneratingSchedule: boolean;
}

export function ScheduleSection({
  schedule,
  questions,
  onRegenerateSchedule,
  isRegeneratingSchedule,
}: ScheduleSectionProps) {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const totalMinutes = schedule.days.reduce((acc, d) => acc + d.minutes, 0);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <span>Deterministic Study Schedule ({schedule.days_available} Days)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Optimized timeline front-loading harder & must-have concepts, leaving final days for review.
          </p>
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-600 font-medium">
            <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              Total: {totalMinutes} mins (~{Math.round(totalMinutes / 60)}h)
            </span>
            <span className="bg-slate-100 px-2.5 py-1 rounded-md">
              Daily Avg: ~{Math.round(totalMinutes / schedule.days_available)} mins
            </span>
          </div>
        </div>

        <button
          onClick={onRegenerateSchedule}
          disabled={isRegeneratingSchedule}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition disabled:opacity-50"
        >
          {isRegeneratingSchedule ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
          )}
          <span>Recalculate Schedule</span>
        </button>
      </div>

      {/* Days Timeline */}
      <div className="space-y-4">
        {schedule.days.map((day) => (
          <div
            key={day.day}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 hover:border-slate-300 transition"
          >
            <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-600 text-white font-bold text-xs">
                  D{day.day}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{day.focus}</h3>
                  <span className="text-xs text-slate-500">
                    Day {day.day} of {schedule.days_available}
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                <Clock className="h-3 w-3 text-slate-500" />
                {day.minutes} mins
              </span>
            </div>

            {day.question_ids.length > 0 ? (
              <div className="mt-3 space-y-2">
                {day.question_ids.map((qId) => {
                  const question = questionMap.get(qId);
                  if (!question) return null;

                  return (
                    <div
                      key={qId}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-800 font-medium">
                          {question.prompt}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 flex-shrink-0 capitalize">
                        {question.category}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-100">
                Light review day: review flashcards, test edge cases, and reflect on behavioral stories.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
