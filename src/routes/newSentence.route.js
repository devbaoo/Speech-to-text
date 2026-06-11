const express = require("express");
const router = express.Router();

const newSentenceController = require("../controllers/newSentence.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

// Public routes
router.get("/", newSentenceController.getAll);
router.get("/domains", newSentenceController.getDomains);
router.get("/:id", newSentenceController.getById);

// User create sentence endpoint
router.post("/user", newSentenceController.createUserSentence);

// Protected routes (admin/manager)
router.post("/", verifyAdminOrManager, newSentenceController.createSentence);
router.post("/bulk", verifyAdminOrManager, newSentenceController.createSentences);
router.put("/:id", verifyAdminOrManager, newSentenceController.updateSentence);
router.delete("/:id", verifyAdminOrManager, newSentenceController.deleteSentence);

module.exports = router;
