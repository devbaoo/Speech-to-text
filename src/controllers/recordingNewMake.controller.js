const storage = require("../services/storage");
const Recording = require("../models/recordingNewMake");
const Sentence = require("../models/sentenceNewMake");
const Person = require("../models/person");
const recordingService = require("../services/recordingNewMake.service");

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
    const { personId, sentenceId, type } = req.body;

    // Validate required fields
    if (!personId || !sentenceId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu personId hoặc sentenceId",
      });
    }

    // Validate type field
    if (!type || !["plaintext", "content"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Thiếu hoặc sai type (chỉ chấp nhận: plaintext, content)",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Thiếu file audio",
      });
    }

    const uploadResult = await storage.upload(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { folder: "lesson_audio_make" }
    );

    const person = await Person.findById(personId);
    const isAutoApproved = person && APPROVED_EMAILS.includes(person.email.toLowerCase());

    // Tìm recording đã có cho personId + sentenceId
    let recording = await Recording.findOne({ personId, sentenceId });

    if (recording) {
      // Update recording đã có
      if (type === "plaintext") {
        recording.audioPlaintext = uploadResult.url;
        recording.durationPlaintext = uploadResult.metadata?.duration || null;
      } else {
        recording.audioContent = uploadResult.url;
        recording.durationContent = uploadResult.metadata?.duration || null;
      }
      recording.recordedAt = new Date();
      await recording.save();
    } else {
      // Tạo recording mới
      const recordingData = {
        personId,
        sentenceId,
        recordedAt: new Date(),
      };

      if (type === "plaintext") {
        recordingData.audioPlaintext = uploadResult.url;
        recordingData.durationPlaintext = uploadResult.metadata?.duration || null;
      } else {
        recordingData.audioContent = uploadResult.url;
        recordingData.durationContent = uploadResult.metadata?.duration || null;
      }

      recording = await Recording.create(recordingData);
    }

    // Kiểm tra xem đã có đủ cả 2 audio chưa
    const hasAudioPlaintext = !!recording.audioPlaintext;
    const hasAudioContent = !!recording.audioContent;

    // Nếu đã có cả 2 bản ghi âm, cập nhật Sentence
    if (hasAudioPlaintext && hasAudioContent) {
      await Sentence.findByIdAndUpdate(sentenceId, {
        audioPlaintext: recording.audioPlaintext,
        audioContent: recording.audioContent,
        savedToSentence: true
      });
    }

    res.status(201).json({
      success: true,
      message: "Upload audio thành công",
      data: {
        recording,
        hasBothRecordings: hasAudioPlaintext && hasAudioContent
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllRecordings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const status = (req.query.isApproved !== undefined || req.query.IsApproved !== undefined)
      ? parseInt(req.query.isApproved || req.query.IsApproved)
      : null;
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

exports.approveRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedRecording = await recordingService.approveRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error approving recording", error: err.message });
  }
};

exports.rejectRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedRecording = await recordingService.rejectRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error rejecting recording", error: err.message });
  }
};

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

exports.deleteRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await recordingService.deleteRecording(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};
