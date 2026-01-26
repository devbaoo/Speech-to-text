const express = require("express");
const router = express.Router();

const sentenceController = require("../controllers/sentence.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

router.post("/", verifyAdminOrManager, sentenceController.createSentence);
router.post("/user", sentenceController.createUserSentence);
router.get("/", sentenceController.getAll);
router.get("/status/:status", sentenceController.getSentencesByStatus);
// Get approved sentences without recordings
router.get("/approved-without-recordings", sentenceController.getApprovedSentencesWithoutRecordings);
// Download/export sentences (mode=all|with-audio|approved)
router.get("/download", sentenceController.downloadSentences);
router.put("/:id", sentenceController.updateSentence);
router.patch("/:id/approve", verifyAdminOrManager, sentenceController.approveSentence);
router.patch("/:id/reject", verifyAdminOrManager, sentenceController.rejectSentence);
// Admin/Manager only: delete sentence
router.delete("/:id", sentenceController.deleteSentence);
// Approve all pending sentences
router.patch("/approve-all", sentenceController.approveAll);

module.exports = router;
