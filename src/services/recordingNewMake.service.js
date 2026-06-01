const cloudinary = require("cloudinary").v2;
const Recording = require("../models/recordingNewMake");
const Sentence = require("../models/sentenceNewMake");
const Person = require("../models/person");
const storage = require("./storage");

// GET ALL
const getAllRecordings = async (page = 1, limit = 20, status = null, email = null) => {
  const skip = (page - 1) * limit;
  const filterQuery = {};
  if (status !== null && status !== undefined) {
    filterQuery.isApproved = status;
  }

  if (email) {
    const persons = await Person.find({
      email: { $regex: email, $options: "i" }
    }).select("_id");

    const personIds = persons.map((p) => p._id);
    if (!personIds.length) {
      return {
        recordings: [],
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
        approvedCount: 0,
        approvedDurationSeconds: 0,
        approvedDurationHours: 0,
        pendingCount: 0,
        rejectedCount: 0,
      };
    }

    filterQuery.personId = { $in: personIds };
  }

  const recordings = await Recording.find(filterQuery)
    .populate("personId", "email")
    .populate("sentenceId", "csTranscript viEquivalent")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const totalCount = await Recording.countDocuments(filterQuery);

  // Stats: đếm theo sentence (1 record = 1 cặp audio)
  const allRecordings = await Recording.find(filterQuery);
  let approvedCount = 0;
  let approvedDurationSeconds = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  allRecordings.forEach(r => {
    if (r.isApproved === 1) {
      approvedCount++;
      approvedDurationSeconds += (r.durationPlaintext || 0) + (r.durationContent || 0);
    } else if (r.isApproved === 0) {
      pendingCount++;
    } else if (r.isApproved === 2) {
      rejectedCount++;
    }
  });
  const approvedDurationHours = approvedDurationSeconds / 3600;

  const mapped = await Promise.all(recordings.map(async (r) => {
    const m = {
      RecordingID: r._id,
      PersonID: r.personId?._id || r.personId,
      SentenceID: r.sentenceId?._id || r.sentenceId,
      recordedAt: r.recordedAt,
      isApproved: r.isApproved,
      // Sentence fields
      csTranscript: r.sentenceId?.csTranscript || null,
      viEquivalent: r.sentenceId?.viEquivalent || null,
    };

    // Sign URLs for audioPlaintext
    if (r.audioPlaintext && (r.audioPlaintext.includes('wasabisys.com') || r.audioPlaintext.includes('s3.'))) {
      try {
        const bucket = process.env.WASABI_BUCKET;
        const parts = r.audioPlaintext.split(`${bucket}/`);
        if (parts.length > 1) {
          m.AudioPlaintext = await storage.getSignedUrl(parts[1]);
        } else {
          m.AudioPlaintext = r.audioPlaintext;
        }
      } catch (err) {
        console.warn("Failed to sign audioPlaintext URL:", err.message);
        m.AudioPlaintext = r.audioPlaintext;
      }
    } else {
      m.AudioPlaintext = r.audioPlaintext;
    }

    // Sign URLs for audioContent
    if (r.audioContent && (r.audioContent.includes('wasabisys.com') || r.audioContent.includes('s3.'))) {
      try {
        const bucket = process.env.WASABI_BUCKET;
        const parts = r.audioContent.split(`${bucket}/`);
        if (parts.length > 1) {
          m.AudioContent = await storage.getSignedUrl(parts[1]);
        } else {
          m.AudioContent = r.audioContent;
        }
      } catch (err) {
        console.warn("Failed to sign audioContent URL:", err.message);
        m.AudioContent = r.audioContent;
      }
    } else {
      m.AudioContent = r.audioContent;
    }

    m.durationPlaintext = r.durationPlaintext;
    m.durationContent = r.durationContent;
    m.Email = r.personId?.email || null;

    return m;
  }));

  return {
    recordings: mapped,
    count: mapped.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    approvedCount,
    approvedDurationSeconds,
    approvedDurationHours,
    pendingCount,
    rejectedCount
  };
};

// APPROVE recording
const approveRecording = async (id) => {
  const recording = await Recording.findById(id);
  if (!recording) throw new Error("Recording not found");
  
  recording.isApproved = 1;
  await recording.save();

  return {
    RecordingID: recording._id,
    PersonID: recording.personId,
    SentenceID: recording.sentenceId,
    isApproved: recording.isApproved,
    recordedAt: recording.recordedAt,
    AudioPlaintext: recording.audioPlaintext,
    AudioContent: recording.audioContent,
    durationPlaintext: recording.durationPlaintext,
    durationContent: recording.durationContent,
  };
};

const rejectRecording = async (id) => {
  const recording = await Recording.findByIdAndUpdate(
    id,
    { isApproved: 2 },
    { new: true }
  );
  if (!recording) throw new Error("Recording not found");
  return {
    RecordingID: recording._id,
    PersonID: recording.personId,
    SentenceID: recording.sentenceId,
    isApproved: recording.isApproved,
    recordedAt: recording.recordedAt,
    AudioPlaintext: recording.audioPlaintext,
    AudioContent: recording.audioContent,
  };
};

const getRecordingsByStatus = async (status) => {
  const validStatuses = [0, 1, 2];
  if (!validStatuses.includes(Number(status))) {
    throw new Error("Status không hợp lệ. Chỉ chấp nhận: 0, 1, 2");
  }

  const recordings = await Recording.find({ isApproved: Number(status) })
    .populate("personId", "email")
    .populate("sentenceId", "csTranscript viEquivalent")
    .sort({ createdAt: -1 });

  return recordings.map((r) => ({
    RecordingID: r._id,
    PersonID: r.personId?._id || r.personId,
    SentenceID: r.sentenceId?._id || r.sentenceId,
    Email: r.personId?.email || null,
    isApproved: r.isApproved,
    recordedAt: r.recordedAt,
    csTranscript: r.sentenceId?.csTranscript || null,
    viEquivalent: r.sentenceId?.viEquivalent || null,
    AudioPlaintext: r.audioPlaintext,
    AudioContent: r.audioContent,
    durationPlaintext: r.durationPlaintext,
    durationContent: r.durationContent,
  }));
};

// DELETE recording
const deleteRecording = async (id) => {
  const recording = await Recording.findById(id);
  if (!recording) throw new Error("Recording not found");

  // Delete audioPlaintext if exists
  if (recording.audioPlaintext) {
    try {
      const urlParts = recording.audioPlaintext.split("/");
      const publicIdWithExtension = urlParts.slice(-1)[0];
      const publicId = publicIdWithExtension.split(".")[0];
      const fullPublicId = `lesson_audio_make/${publicId}`;
      await cloudinary.uploader.destroy(fullPublicId, { resource_type: "video" });
    } catch (error) {
      console.error("Lỗi khi xóa audioPlaintext từ Cloudinary:", error.message);
    }
  }

  // Delete audioContent if exists
  if (recording.audioContent) {
    try {
      const urlParts = recording.audioContent.split("/");
      const publicIdWithExtension = urlParts.slice(-1)[0];
      const publicId = publicIdWithExtension.split(".")[0];
      const fullPublicId = `lesson_audio_make/${publicId}`;
      await cloudinary.uploader.destroy(fullPublicId, { resource_type: "video" });
    } catch (error) {
      console.error("Lỗi khi xóa audioContent từ Cloudinary:", error.message);
    }
  }

  await Recording.findByIdAndDelete(id);

  return { message: "Recording đã được xóa thành công" };
};

module.exports = {
  getAllRecordings,
  approveRecording,
  rejectRecording,
  getRecordingsByStatus,
  deleteRecording,
};
