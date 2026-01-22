const express = require("express");
const recordingController = require("../controllers/recording.controller");
const uploadAudio = require("../middlewares/recording.middleware");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

const router = express.Router();

router.post(
  "/",
  uploadAudio.single("audio"),
  recordingController.uploadAudio
);
router.get("/", recordingController.getAllRecordings);
router.get("/status/:status", recordingController.getRecordingsByStatus);
router.patch("/:id/approve", verifyAdminOrManager, recordingController.approveRecording);
router.patch("/:id/reject", verifyAdminOrManager, recordingController.rejectRecording);

module.exports = router;
