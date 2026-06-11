const express = require("express");
const router = express.Router();

const newRecordingController = require("../controllers/newRecording.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");
const upload = require("../middlewares/recording.middleware");

// Public routes (user can upload)
router.post("/upload", upload.single("file"), newRecordingController.uploadAudio);

// Protected routes (admin/manager)
router.get("/", newRecordingController.getAllRecordings);
router.get("/status/:status", newRecordingController.getRecordingsByStatus);
router.patch("/:id/approve", verifyAdminOrManager, newRecordingController.approveRecording);
router.patch("/:id/reject", verifyAdminOrManager, newRecordingController.rejectRecording);
router.delete("/:id", verifyAdminOrManager, newRecordingController.deleteRecording);
router.delete("/duplicates", verifyAdminOrManager, newRecordingController.deleteDuplicateRecordings);
router.get("/download-by-speaker", newRecordingController.downloadRecordingsBySpeaker);

module.exports = router;
