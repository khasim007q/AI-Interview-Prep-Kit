"use client";

import { useState } from "react";
import { X, RotateCw, CheckCircle2, Play, Award } from "lucide-react";
import type { Flashcard } from "@ai-interview-prep/shared";

interface PracticeModalProps {
  isOpen: boolean;
  cards: Flashcard[];
  onClose: () => void;
  onRecordConfidence: (cardId: string, confidence: number) => void;
}

export function PracticeModal({
  isOpen,
  cards,
  onClose,
  onRecordConfidence,
}: PracticeModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  if (!isOpen || cards.length === 0) return null;

  const currentCard = cards[currentIndex];

  const handleRate = (confidence: number) => {
    onRecordConfidence(currentCard.id, confidence);

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    } else {
      setIsCompleted(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsCompleted(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              Practice Mode
            </span>
            {!isCompleted && (
              <span className="text-xs text-slate-500">
                Card {currentIndex + 1} of {cards.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="Close practice mode"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isCompleted ? (
          <div className="py-8 text-center space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-2">
              <Award className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Practice Session Complete!</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Your recall attempts and confidence ratings were recorded to help identify weak areas and reinforce retention.
            </p>
            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                onClick={handleRestart}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Practice Again</span>
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition"
              >
                <span>Done</span>
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Interactive 3D Card */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="cursor-pointer min-h-[220px] rounded-2xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 p-6 flex flex-col justify-between hover:border-indigo-200 transition shadow-inner"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-2 block">
                  {isFlipped ? "Back (Answer)" : "Front (Question / Prompt)"}
                </span>
                <p className="text-base font-semibold text-slate-900 leading-snug">
                  {isFlipped ? currentCard.back : currentCard.front}
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-4 border-t border-slate-100">
                <span className="flex items-center gap-1">
                  <RotateCw className="h-3 w-3" />
                  Click card to flip
                </span>
                {currentCard.requirement_ids && currentCard.requirement_ids.length > 0 && (
                  <span className="font-mono text-slate-500">
                    {currentCard.requirement_ids.join(", ")}
                  </span>
                )}
              </div>
            </div>

            {/* Confidence Rating Controls (1 to 5) */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-center text-xs font-semibold text-slate-600 mb-3">
                How well did you know this concept? (1 = Hard, 5 = Mastered)
              </p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { rating: 1, label: "1", color: "hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700" },
                  { rating: 2, label: "2", color: "hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700" },
                  { rating: 3, label: "3", color: "hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700" },
                  { rating: 4, label: "4", color: "hover:bg-cyan-50 hover:border-cyan-300 hover:text-cyan-700" },
                  { rating: 5, label: "5", color: "hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700" },
                ].map(({ rating, label, color }) => (
                  <button
                    key={rating}
                    onClick={() => handleRate(rating)}
                    className={`rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700 shadow-sm transition ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
