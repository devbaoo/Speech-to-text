const express = require("express");
const router = express.Router();

const sentenceController = require("../controllers/sentenceNewMake.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

// Create sentence (admin/manager)
router.post("/", verifyAdminOrManager, sentenceController.createSentence);

// Create user sentence
router.post("/user", sentenceController.createUserSentence);

// Import JSON data
router.post("/import", verifyAdminOrManager, sentenceController.importJson);

// Get approved sentences without recordings
router.get("/approved-without-recordings", sentenceController.getApprovedSentencesWithoutRecordings);

// Get all sentences with pagination
router.get("/", sentenceController.getAll);

// Get sentence by externalId or _id
router.get("/:id", sentenceController.getByExternalId);

// Update sentence
router.put("/:id", sentenceController.updateSentence);

// Approve sentence
router.patch("/:id/approve", verifyAdminOrManager, sentenceController.approveSentence);

// Reject sentence
router.patch("/:id/reject", verifyAdminOrManager, sentenceController.rejectSentence);

// Delete sentence by id
router.delete("/:id", sentenceController.deleteSentence);

// Download sentences
router.get("/download", sentenceController.downloadSentences);

// Get statistics
router.get("/stats/all", sentenceController.getStats);

// Delete sentence by externalId
router.delete("/delete/:externalId", verifyAdminOrManager, sentenceController.deleteByExternalId);

// Delete all sentences
router.delete("/all/delete", verifyAdminOrManager, sentenceController.deleteAll);

module.exports = router;
