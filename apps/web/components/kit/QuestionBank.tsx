"use client";

import { useState } from "react";
import { Plus, RefreshCw, Loader2, Sparkles, HelpCircle } from "lucide-react";
import { QuestionCard } from "./QuestionCard";
import { AddQuestionModal } from "./AddQuestionModal";
import type {
  Question,
  QuestionCategory,
  Requirement,
} from "@ai-interview-prep/shared";

interface QuestionBankProps {
  questions: Question[];
  requirements: Requirement[];
  onUpdateQuestion: (questionId: string, patch: Partial<Question>) => void;
  onDeleteQuestion: (questionId: string) => void;
  onAddQuestion: (question: Question) => void;
  onReorderQuestions: (orderedIds: string[]) => void;
  onRegenerateCategory: (category: QuestionCategory) => void;
  isRegeneratingCategory: boolean;
}

const CATEGORY_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All Questions" },
  { value: "technical", label: "Technical" },
  { value: "system-design", label: "System Design" },
  { value: "behavioural", label: "Behavioural" },
  { value: "company-fit", label: "Company Fit" },
];

export function QuestionBank({
  questions,
  requirements,
  onUpdateQuestion,
  onDeleteQuestion,
  onAddQuestion,
  onReorderQuestions,
  onRegenerateCategory,
  isRegeneratingCategory,
}: QuestionBankProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const filteredQuestions =
    activeCategory === "all"
      ? questions
      : questions.filter((q) => q.category === activeCategory);

  const counts: Record<string, number> = {
    all: questions.length,
    technical: questions.filter((q) => q.category === "technical").length,
    "system-design": questions.filter((q) => q.category === "system-design").length,
    behavioural: questions.filter((q) => q.category === "behavioural").length,
    "company-fit": questions.filter((q) => q.category === "company-fit").length,
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const currentQ = filteredQuestions[index];
    const prevQ = filteredQuestions[index - 1];

    // Find indices in global questions array
    const globalCurrentIdx = questions.findIndex((q) => q.id === currentQ.id);
    const globalPrevIdx = questions.findIndex((q) => q.id === prevQ.id);

    const reordered = [...questions];
    reordered[globalCurrentIdx] = prevQ;
    reordered[globalPrevIdx] = currentQ;

    onReorderQuestions(reordered.map((q) => q.id));
  };

  const handleMoveDown = (index: number) => {
    if (index >= filteredQuestions.length - 1) return;
    const currentQ = filteredQuestions[index];
    const nextQ = filteredQuestions[index + 1];

    const globalCurrentIdx = questions.findIndex((q) => q.id === currentQ.id);
    const globalNextIdx = questions.findIndex((q) => q.id === nextQ.id);

    const reordered = [...questions];
    reordered[globalCurrentIdx] = nextQ;
    reordered[globalNextIdx] = currentQ;

    onReorderQuestions(reordered.map((q) => q.id));
  };

  return (
    <div className="space-y-6">
      {/* Category Pills & Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveCategory(tab.value)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition ${
                activeCategory === tab.value
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  activeCategory === tab.value
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                {counts[tab.value] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Builder Toolbar Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>Add Question</span>
          </button>

          {activeCategory !== "all" && (
            <button
              onClick={() =>
                onRegenerateCategory(activeCategory as QuestionCategory)
              }
              disabled={isRegeneratingCategory}
              title="Preserves pinned, edited, and user-created questions"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              {isRegeneratingCategory ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              )}
              <span>Regenerate Category</span>
            </button>
          )}
        </div>
      </div>

      {/* Helpful Hint on Preservation */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1">
        <span>
          Showing {filteredQuestions.length} of {questions.length} questions. Use Up/Down controls to adjust order.
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-slate-400">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Pinned and edited questions are safely preserved during section regeneration.
        </span>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <HelpCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            No questions in this category yet
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Add a question manually or generate questions for this topic.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Question</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              totalCount={filteredQuestions.length}
              onUpdate={onUpdateQuestion}
              onDelete={onDeleteQuestion}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}

      {/* Add Question Modal */}
      <AddQuestionModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={onAddQuestion}
        requirements={requirements}
        defaultCategory={
          activeCategory !== "all"
            ? (activeCategory as QuestionCategory)
            : "technical"
        }
      />
    </div>
  );
}
