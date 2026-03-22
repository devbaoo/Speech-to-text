const express = require("express");
const router = express.Router();

const sentenceController = require("../controllers/sentenceNew.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

router.post("/", verifyAdminOrManager, sentenceController.createSentence);
router.post("/user", sentenceController.createUserSentence);
router.get("/", sentenceController.getAll);
router.get("/status/:status", sentenceController.getSentencesByStatus);
router.get("/approved-without-recordings", sentenceController.getApprovedSentencesWithoutRecordings);
router.get("/download", sentenceController.downloadSentences);
router.put("/:id", sentenceController.updateSentence);
router.patch("/:id/approve", verifyAdminOrManager, sentenceController.approveSentence);
router.patch("/:id/reject", verifyAdminOrManager, sentenceController.rejectSentence);
router.delete("/:id", sentenceController.deleteSentence);
router.patch("/approve-all", sentenceController.approveAll);

module.exports = router;
