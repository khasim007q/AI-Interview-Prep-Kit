"use client";

import { useState } from "react";
import {
  Pin,
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Tag,
  Save,
  X,
  UserCheck,
} from "lucide-react";
import type {
  Question,
  QuestionCategory,
  QuestionDifficulty,
} from "@ai-interview-prep/shared";

interface QuestionCardProps {
  question: Question;
  index: number;
  totalCount: number;
  onUpdate: (questionId: string, patch: Partial<Question>) => void;
  onDelete: (questionId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

const CATEGORIES: { value: QuestionCategory; label: string }[] = [
  { value: "technical", label: "Technical" },
  { value: "system-design", label: "System Design" },
  { value: "behavioural", label: "Behavioural" },
  { value: "company-fit", label: "Company Fit" },
];

const DIFFICULTIES: { value: QuestionDifficulty; label: string }[] = [
  { value: 1, label: "Easy (1)" },
  { value: 2, label: "Medium (2)" },
  { value: 3, label: "Hard (3)" },
];

export function QuestionCard({
  question,
  index,
  totalCount,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: QuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [promptText, setPromptText] = useState(question.prompt);
  const [outlineText, setOutlineText] = useState(question.answer_outline);

  const isPinned = !!question.metadata?.pinned;
  const isEdited = !!question.metadata?.edited;
  const isUserCreated = question.metadata?.origin === "user" && !isEdited;

  const handleSaveEdit = () => {
    if (!promptText.trim() || !outlineText.trim()) return;
    onUpdate(question.id, {
      prompt: promptText.trim(),
      answer_outline: outlineText.trim(),
    });
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setPromptText(question.prompt);
    setOutlineText(question.answer_outline);
    setIsEditing(false);
  };

  const handleTogglePin = () => {
    onUpdate(question.id, {
      metadata: {
        origin: question.metadata?.origin || "generated",
        edited: question.metadata?.edited || false,
        pinned: !isPinned,
        state: "active",
        revision: (question.metadata?.revision || 0) + 1,
      },
    });
  };

  const handleCategoryChange = (newCat: QuestionCategory) => {
    if (newCat === question.category) return;
    onUpdate(question.id, { category: newCat });
  };

  const handleDifficultyChange = (newDiff: QuestionDifficulty) => {
    if (newDiff === question.difficulty) return;
    onUpdate(question.id, { difficulty: newDiff });
  };

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isPinned
          ? "border-amber-300 bg-amber-50/20 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300 shadow-sm"
      }`}
    >
      <div className="p-5 sm:p-6">
        {/* Card Header & Controls */}
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              #{index + 1}
            </span>

            {/* Category Dropdown (Move Category) */}
            <select
              value={question.category}
              onChange={(e) =>
                handleCategoryChange(e.target.value as QuestionCategory)
              }
              aria-label="Move question category"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {/* Difficulty Dropdown */}
            <select
              value={question.difficulty}
              onChange={(e) =>
                handleDifficultyChange(Number(e.target.value) as QuestionDifficulty)
              }
              aria-label="Change question difficulty"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
            >
              {DIFFICULTIES.map((diff) => (
                <option key={diff.value} value={diff.value}>
                  {diff.label}
                </option>
              ))}
            </select>

            {/* Status Badges */}
            {isPinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                <Pin className="h-2.5 w-2.5 fill-amber-800" />
                Pinned
              </span>
            )}
            {isEdited && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
                <UserCheck className="h-2.5 w-2.5" />
                User edited
              </span>
            )}
            {isUserCreated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                User created
              </span>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1">
            {/* Up / Down Reorder */}
            <button
              onClick={() => onMoveUp(index)}
              disabled={index === 0}
              title="Move Up"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition"
              aria-label="Move question up"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => onMoveDown(index)}
              disabled={index === totalCount - 1}
              title="Move Down"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 transition"
              aria-label="Move question down"
            >
              <ArrowDown className="h-4 w-4" />
            </button>

            {/* Pin Toggle */}
            <button
              onClick={handleTogglePin}
              title={isPinned ? "Unpin question" : "Pin question (preserves during regeneration)"}
              className={`rounded p-1 transition ${
                isPinned
                  ? "text-amber-600 hover:bg-amber-100"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
              aria-label="Toggle pin"
            >
              <Pin className={`h-4 w-4 ${isPinned ? "fill-amber-600" : ""}`} />
            </button>

            {/* Edit Toggle */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              title="Edit Question"
              className={`rounded p-1 transition ${
                isEditing
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
              aria-label="Edit question"
            >
              <Edit3 className="h-4 w-4" />
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to delete this question?")) {
                  onDelete(question.id);
                }
              }}
              title="Delete question"
              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              aria-label="Delete question"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body / Edit Mode */}
        {isEditing ? (
          <div className="space-y-3 mt-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Question Prompt
              </label>
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expected Answer Outline
              </label>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 justify-end pt-1">
              <button
                onClick={handleCancelEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSaveEdit}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-base font-semibold text-slate-900 leading-snug">
              {question.prompt}
            </h3>

            {/* Linked Requirements */}
            {question.requirement_ids && question.requirement_ids.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3 w-3 text-slate-400" />
                {question.requirement_ids.map((reqId) => (
                  <span
                    key={reqId}
                    className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md"
                  >
                    {reqId}
                  </span>
                ))}
              </div>
            )}

            {/* Answer Outline Toggle */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 hover:text-indigo-600 transition"
              >
                <span>Expected Answer Outline</span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              {isExpanded && (
                <div className="mt-2 text-sm text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100 whitespace-pre-line">
                  {question.answer_outline}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
