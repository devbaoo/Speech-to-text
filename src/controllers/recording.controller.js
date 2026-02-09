const cloudinary = require("cloudinary").v2;
const Recording = require("../models/recording");
const Person = require("../models/person");
const recordingService = require("../services/recording.service");

// Whitelist of emails that are auto-approved
const APPROVED_EMAILS = [
  "nguyenngobao19@gmail.com",
  "thang.nguyenhoang2709@hcmut.edu.vn",
  "khang.nguyenhuynh@hcmut.edu.vn",
  "chau.nguyen2452164@hcmut.edu.vn",
  "duy.nguyenphuocnhat@hcmut.edu.vn",
  "nguyen.lebao2808@hcmut.edu.vn",
  "quang.nguyen0303@hcmut.edu.vn"
];

exports.uploadAudio = async (req, res) => {
  try {
    const { personId, sentenceId } = req.body;
    if (!personId || !sentenceId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu personId hoặc sentenceId",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Thiếu file audio",
      });
    }
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "lesson_audio",
    });

    // Get person's email to check if auto-approved
    const person = await Person.findById(personId);
    const isAutoApproved = person && APPROVED_EMAILS.includes(person.email.toLowerCase());

    const recording = await Recording.create({
      personId,
      sentenceId,
      audioUrl: result.secure_url,
      isApproved: isAutoApproved ? 1 : 0, // 1 = được duyệt, 0 = chờ duyệt
      duration: result.duration || null,
      recordedAt: new Date(),
    });
    res.status(201).json({
      success: true,
      message: "Upload audio thành công",
      data: recording,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//GET ALL RECORDING
exports.getAllRecordings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    // Support both isApproved and IsApproved (case-insensitive)
    const status = (req.query.isApproved !== undefined || req.query.IsApproved !== undefined) 
      ? parseInt(req.query.isApproved || req.query.IsApproved) 
      : null;
    // Optional search by user email (case-insensitive)
    const email = req.query.email || req.query.Email || null;

    const result = await recordingService.getAllRecordings(page, limit, status, email);
    res.status(200).json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      approvedCount: result.approvedCount,
      approvedDurationSeconds: result.approvedDurationSeconds,
      approvedDurationHours: result.approvedDurationHours,
      pendingCount: result.pendingCount,
      rejectedCount: result.rejectedCount,
      data: result.recordings
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching recordings", error: err.message });
  }
};

// APPROVE RECORDING
exports.approveRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedRecording = await recordingService.approveRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error approving recording", error: err.message });
  }
};

// REJECT RECORDING
exports.rejectRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedRecording = await recordingService.rejectRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error rejecting recording", error: err.message });
  }
};

// GET RECORDING BY STATUS
exports.getRecordingsByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    const recordings = await recordingService.getRecordingsByStatus(status);

    res.json({
      isApproved: Number(status),
      count: recordings.length,
      data: recordings
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE RECORDING
exports.deleteRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await recordingService.deleteRecording(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};