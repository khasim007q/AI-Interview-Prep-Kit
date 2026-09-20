"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { Flashcard, Requirement } from "@ai-interview-prep/shared";

interface AddFlashcardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (card: Flashcard) => void;
  requirements: Requirement[];
}

export function AddFlashcardModal({
  isOpen,
  onClose,
  onAdd,
  requirements,
}: AddFlashcardModalProps) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) {
      setError("Please enter the front prompt/concept.");
      return;
    }
    if (!back.trim()) {
      setError("Please provide the answer/explanation on the back.");
      return;
    }

    const newCard: Flashcard = {
      id: `f_user_${Date.now()}`,
      front: front.trim(),
      back: back.trim(),
      requirement_ids:
        selectedReqIds.length > 0
          ? selectedReqIds
          : requirements.length > 0
          ? [requirements[0].id]
          : [],
      metadata: {
        origin: "user",
        edited: false,
        pinned: true,
        state: "active",
        revision: 1,
      },
    };

    onAdd(newCard);
    onClose();
    setFront("");
    setBack("");
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
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Plus className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Add Practice Flashcard</h3>
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
              Front: Question / Prompt / Concept *
            </label>
            <textarea
              required
              rows={2}
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="e.g. What is the CAP theorem and what trade-offs does it imply?"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1">
              Back: Answer / Core Takeaway *
            </label>
            <textarea
              required
              rows={4}
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="Concise, high-yield explanation to test yourself during recall..."
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {requirements.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1">
                Link to Requirement (Optional)
              </label>
              <div className="max-h-28 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50">
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
              <span>Add Flashcard</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
