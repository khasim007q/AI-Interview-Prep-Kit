"use client";

import { useState } from "react";
import { X, Plus, Sparkles } from "lucide-react";
import type {
  Question,
  QuestionCategory,
  QuestionDifficulty,
  Requirement,
} from "@ai-interview-prep/shared";

interface AddQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (question: Question) => void;
  requirements: Requirement[];
  defaultCategory?: QuestionCategory;
}

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "system-design", label: "System Design" },
  { value: "behavioural", label: "Behavioural" },
  { value: "company-fit", label: "Company Fit" },
];

export function AddQuestionModal({
  isOpen,
  onClose,
  onAdd,
  requirements,
  defaultCategory = "technical",
}: AddQuestionModalProps) {
  const [prompt, setPrompt] = useState("");
  const [outline, setOutline] = useState("");
  const [category, setCategory] = useState<QuestionCategory>(defaultCategory);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(2);
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setError("Please enter a question prompt.");
      return;
    }
    if (!outline.trim()) {
      setError("Please provide an expected answer outline.");
      return;
    }

    const newQuestion: Question = {
      id: `q_user_${Date.now()}`,
      category,
      difficulty,
      prompt: prompt.trim(),
      answer_outline: outline.trim(),
      requirement_ids:
        selectedReqIds.length > 0
          ? selectedReqIds
          : requirements.length > 0
          ? [requirements[0].id]
          : [],
      metadata: {
        origin: "user",
        edited: false,
        pinned: true, // Auto-pin user questions so regeneration never deletes them
        state: "active",
        revision: 1,
      },
    };

    onAdd(newQuestion);
    onClose();
    // Reset form
    setPrompt("");
    setOutline("");
    setSelectedReqIds([]);
    setError(null);
  };

  const toggleReqId = (id: string) => {
    setSelectedReqIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Plus className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Add Interview Question</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={`rounded-lg py-1.5 px-2 text-xs font-medium border transition ${
                    category === cat.value
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Difficulty
            </label>
            <div className="flex gap-2">
              {[
                { val: 1 as QuestionDifficulty, label: "1 — Easy" },
                { val: 2 as QuestionDifficulty, label: "2 — Medium" },
                { val: 3 as QuestionDifficulty, label: "3 — Hard" },
              ].map((diff) => (
                <button
                  type="button"
                  key={diff.val}
                  onClick={() => setDifficulty(diff.val)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium border transition ${
                    difficulty === diff.val
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-semibold"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {diff.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Question Prompt *
            </label>
            <textarea
              required
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. How do you implement idempotent API endpoints in distributed microservices?"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Expected Answer Outline *
            </label>
            <textarea
              required
              rows={4}
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder="Key concepts, principles, trade-offs, and examples candidate should demonstrate..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {requirements.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1">
                Link to Role Requirements (Optional)
              </label>
              <div className="max-h-32 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
                {requirements.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-indigo-600"
                  >
                    <input
                      type="checkbox"
                      checked={selectedReqIds.includes(r.id)}
                      onChange={() => toggleReqId(r.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-mono font-bold text-slate-500">{r.id}:</span>
                    <span className="truncate">{r.text}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Question</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
