import { Router } from "express";
import { kitController } from "../controllers/kit.controller.js";
import { practiceController } from "../controllers/practice.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const kitsRouter = Router();

// All kit operations require authentication
kitsRouter.use(requireAuth);

// Kit Lifecycle & CRUD
kitsRouter.post("/", (req, res, next) => kitController.createKit(req, res, next));
kitsRouter.get("/", (req, res, next) => kitController.listKits(req, res, next));
kitsRouter.get("/:kitId", (req, res, next) => kitController.getKit(req, res, next));
kitsRouter.get("/:kitId/generation", (req, res, next) =>
  kitController.getGenerationStatus(req, res, next)
);
kitsRouter.post("/:kitId/cancel", (req, res, next) =>
  kitController.cancelKit(req, res, next)
);
kitsRouter.patch("/:kitId", (req, res, next) => kitController.updateKit(req, res, next));
kitsRouter.delete("/:kitId", (req, res, next) => kitController.deleteKit(req, res, next));

// Question Editing & Management
kitsRouter.post("/:kitId/questions", (req, res, next) => kitController.addQuestion(req, res, next));
kitsRouter.patch("/:kitId/questions/order", (req, res, next) =>
  kitController.reorderQuestions(req, res, next)
);
kitsRouter.patch("/:kitId/questions/:questionId", (req, res, next) =>
  kitController.updateQuestion(req, res, next)
);
kitsRouter.delete("/:kitId/questions/:questionId", (req, res, next) =>
  kitController.deleteQuestion(req, res, next)
);

// Flashcards Editing & Management
kitsRouter.post("/:kitId/flashcards", (req, res, next) => kitController.addFlashcard(req, res, next));
kitsRouter.patch("/:kitId/flashcards/:flashcardId", (req, res, next) =>
  kitController.updateFlashcard(req, res, next)
);
kitsRouter.delete("/:kitId/flashcards/:flashcardId", (req, res, next) =>
  kitController.deleteFlashcard(req, res, next)
);

// Section Regeneration
kitsRouter.post("/:kitId/regenerate/company-brief", (req, res, next) =>
  kitController.regenerateCompanyBrief(req, res, next)
);
kitsRouter.post("/:kitId/regenerate/questions/:category", (req, res, next) =>
  kitController.regenerateCategoryQuestions(req, res, next)
);
kitsRouter.post("/:kitId/regenerate/schedule", (req, res, next) =>
  kitController.regenerateSchedule(req, res, next)
);

// Practice Mode
kitsRouter.post("/:kitId/practice/attempts", (req, res, next) =>
  practiceController.recordAttempt(req, res, next)
);
kitsRouter.get("/:kitId/practice/summary", (req, res, next) =>
  practiceController.getSummary(req, res, next)
);
kitsRouter.get("/:kitId/practice/cards", (req, res, next) =>
  practiceController.getPracticeCards(req, res, next)
);
