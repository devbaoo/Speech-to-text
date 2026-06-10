const express = require("express");
const router = express.Router();

const sentenceController = require("../controllers/sentenceNewMake.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");
const uploadJson = require("../middlewares/jsonUpload.middleware");

router.post("/", verifyAdminOrManager, sentenceController.createSentence);
router.post("/user", sentenceController.createUserSentence);
router.post("/import-file", verifyAdminOrManager, uploadJson.single('file'), sentenceController.importJsonFile);
router.post("/import", verifyAdminOrManager, sentenceController.importJson);
router.get("/approved-without-recordings", sentenceController.getApprovedSentencesWithoutRecordings);
router.get("/", sentenceController.getAll);
router.get("/:id", sentenceController.getByExternalId);
router.put("/:id", sentenceController.updateSentence);
router.patch("/:id/approve", verifyAdminOrManager, sentenceController.approveSentence);
router.patch("/:id/reject", verifyAdminOrManager, sentenceController.rejectSentence);
router.delete("/:id", sentenceController.deleteSentence);
router.get("/download", sentenceController.downloadSentences);
router.get("/stats/all", sentenceController.getStats);
router.delete("/delete/:externalId", verifyAdminOrManager, sentenceController.deleteByExternalId);
router.delete("/all/delete", verifyAdminOrManager, sentenceController.deleteAll);

module.exports = router;
