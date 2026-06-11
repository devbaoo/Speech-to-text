const storage = require("../services/storage");
const NewRecording = require("../models/newRecording");
const NewSentence = require("../models/newSentence");
const Person = require("../models/person");
const newRecordingService = require("../services/newRecording.service");

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
    const { personId, sentenceId, type, email } = req.body;
    if (!sentenceId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu sentenceId",
      });
    }
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

    let personIdValue = personId || null;
    let emailValue = email || null;

    if (personIdValue) {
      const person = await Person.findById(personIdValue);
      if (person) {
        emailValue = person.email;
      }
    }

    const uploadResult = await storage.upload(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { folder: "lesson_audio" }
    );

    const isAutoApproved = emailValue && APPROVED_EMAILS.includes(emailValue.toLowerCase());

    const recording = await NewRecording.create({
      personId: personIdValue,
      sentenceId,
      audioUrl: uploadResult.url,
      type: type,
      isApproved: isAutoApproved ? 1 : 0,
      duration: uploadResult.metadata?.duration || null,
      recordedAt: new Date(),
      email: emailValue,
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

exports.getAllRecordings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const status = (req.query.isApproved !== undefined || req.query.IsApproved !== undefined)
      ? parseInt(req.query.isApproved || req.query.IsApproved)
      : null;
    const email = req.query.email || req.query.Email || null;

    const result = await newRecordingService.getAllRecordings(page, limit, status, email);
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
    const updatedRecording = await newRecordingService.approveRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error approving recording", error: err.message });
  }
};

exports.rejectRecording = async (req, res) => {
  try {
    const id = req.params.id;
    const updatedRecording = await newRecordingService.rejectRecording(id);
    res.status(200).json(updatedRecording);
  } catch (err) {
    res.status(500).json({ message: "Error rejecting recording", error: err.message });
  }
};

exports.getRecordingsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const recordings = await newRecordingService.getRecordingsByStatus(status);
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
    const result = await newRecordingService.deleteRecording(id);
    res.status(200).json(result);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

exports.deleteDuplicateRecordings = async (req, res) => {
  try {
    const result = await newRecordingService.deleteDuplicateRecordings();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi xóa recordings thừa",
      error: err.message
    });
  }
};

exports.downloadRecordingsBySpeaker = async (req, res) => {
  try {
    let { emails, personId, dateFrom, dateTo, isApproved } = req.query;

    if (personId && !emails) {
      emails = personId;
    }

    if (!emails) {
      return res.status(400).json({
        success: false,
        message: "Thiếu email hoặc emails (comma-separated)"
      });
    }

    const emailList = emails.split(",").map(e => e.trim()).filter(e => e);

    if (emailList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Danh sách email trống"
      });
    }

    const approvalStatus = isApproved ? parseInt(isApproved) : 1;

    const { archive, fileName, recordingCount } = await newRecordingService.downloadRecordingsBySpeaker(
      emailList,
      dateFrom,
      dateTo,
      approvalStatus
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("X-Recording-Count", recordingCount);

    archive.pipe(res);

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Lỗi khi tạo file download",
          error: err.message
        });
      }
    });
  } catch (err) {
    console.error("Download error:", err);
    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
};
