"use client";

import { useState } from "react";
import {
  Layers,
  Play,
  Plus,
  Trash2,
  Edit3,
  Tag,
  Save,
  X,
  Sparkles,
} from "lucide-react";
import { AddFlashcardModal } from "./AddFlashcardModal";
import type {
  Flashcard,
  PracticeSummary,
  Requirement,
} from "@ai-interview-prep/shared";

interface FlashcardBankProps {
  flashcards: Flashcard[];
  requirements: Requirement[];
  practiceSummary?: PracticeSummary;
  onUpdateFlashcard: (flashcardId: string, patch: Partial<Flashcard>) => void;
  onDeleteFlashcard: (flashcardId: string) => void;
  onAddFlashcard: (flashcard: Flashcard) => void;
  onStartPractice: () => void;
}

export function FlashcardBank({
  flashcards,
  requirements,
  practiceSummary,
  onUpdateFlashcard,
  onDeleteFlashcard,
  onAddFlashcard,
  onStartPractice,
}: FlashcardBankProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  const handleStartEdit = (card: Flashcard) => {
    setEditingCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
  };

  const handleSaveEdit = (cardId: string) => {
    if (!editFront.trim() || !editBack.trim()) return;
    onUpdateFlashcard(cardId, {
      front: editFront.trim(),
      back: editBack.trim(),
    });
    setEditingCardId(null);
    setSavedCardId(cardId);
    setTimeout(() => setSavedCardId(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600" />
            <span>Active-Recall Flashcards ({flashcards.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Test key concepts, principles, and trade-offs using spaced repetition.
          </p>

          {/* Retention Stats */}
          {practiceSummary && (
            <div className="mt-3 flex items-center gap-4 text-xs font-medium">
              <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                {(practiceSummary.confidenceDistribution?.["5"] || 0) +
                  (practiceSummary.confidenceDistribution?.["4"] || 0)}{" "}
                Mastered
              </span>
              <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                {(practiceSummary.confidenceDistribution?.["3"] || 0) +
                  (practiceSummary.confidenceDistribution?.["2"] || 0)}{" "}
                Learning
              </span>
              <span className="text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                {Math.max(
                  0,
                  practiceSummary.totalFlashcards - practiceSummary.attemptedCount
                )}{" "}
                Unpracticed
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            <span>Add Flashcard</span>
          </button>
          <button
            onClick={onStartPractice}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
          >
            <Play className="h-4 w-4" />
            <span>Start Practice Mode</span>
          </button>
        </div>
      </div>

      {/* Flashcard Cards Grid */}
      {flashcards.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
          <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900">No flashcards yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Create custom flashcards to begin practicing active recall.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Flashcard</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flashcards.map((card, idx) => {
            const isEditing = editingCardId === card.id;

            return (
              <div
                key={card.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:border-slate-300 transition"
              >
                {isEditing ? (
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Front (Prompt)
                      </label>
                      <textarea
                        rows={2}
                        value={editFront}
                        onChange={(e) => setEditFront(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Back (Answer)
                      </label>
                      <textarea
                        rows={3}
                        value={editBack}
                        onChange={(e) => setEditBack(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => setEditingCardId(null)}
                        className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(card.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                      >
                        <Save className="h-3 w-3" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        {savedCardId === card.id && (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-200">
                            Saved
                          </span>
                        )}
                        {card.metadata?.edited && savedCardId !== card.id && (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium border border-indigo-100">
                            Edited
                          </span>
                        )}
                        <button
                          onClick={() => handleStartEdit(card)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                          title="Edit flashcard"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Delete this flashcard?")) {
                              onDeleteFlashcard(card.id);
                            }
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Delete flashcard"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                        Front
                      </span>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {card.front}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Back / Key Takeaway
                      </span>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        {card.back}
                      </p>
                    </div>

                    {card.requirement_ids && card.requirement_ids.length > 0 && (
                      <div className="mt-3 flex items-center gap-1 flex-wrap">
                        <Tag className="h-2.5 w-2.5 text-slate-400" />
                        {card.requirement_ids.map((rId) => (
                          <span
                            key={rId}
                            className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded"
                          >
                            {rId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Flashcard Modal */}
      <AddFlashcardModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={onAddFlashcard}
        requirements={requirements}
      />
    </div>
  );
}
