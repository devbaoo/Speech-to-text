const cloudinary = require("cloudinary").v2;
const Recording = require("../models/recordingNewMake");
const Sentence = require("../models/sentenceNewMake");
const Person = require("../models/person");
const { mapRecording } = require("../utils/recording.mapper");
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

  const approvedAgg = await Recording.aggregate([
    { $match: { isApproved: 1 } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalDuration: { $sum: { $ifNull: ["$duration", 0] } }
      }
    }
  ]);
  const approvedCount = approvedAgg[0]?.count || 0;
  const approvedDurationSeconds = approvedAgg[0]?.totalDuration || 0;
  const approvedDurationHours = approvedDurationSeconds / 3600;
  const pendingCount = await Recording.countDocuments({ isApproved: 0 });
  const rejectedCount = await Recording.countDocuments({ isApproved: 2 });

  const mapped = await Promise.all(recordings.map(async (r) => {
    const m = mapRecording(r);
    if (m.AudioUrl && (m.AudioUrl.includes('wasabisys.com') || m.AudioUrl.includes('s3.'))) {
      try {
        const bucket = process.env.WASABI_BUCKET;
        const parts = m.AudioUrl.split(`${bucket}/`);
        if (parts.length > 1) {
          m.AudioUrl = await storage.getSignedUrl(parts[1]);
        }
      } catch (err) {
        console.warn("Failed to sign Wasabi URL:", err.message);
      }
    }
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
  
  const updatedRecording = await Recording.findByIdAndUpdate(
    id,
    { isApproved: 1 },
    { new: true }
  );

  const mapped = mapRecording(updatedRecording);
  if (mapped.AudioUrl && (mapped.AudioUrl.includes('wasabisys.com') || mapped.AudioUrl.includes('s3.'))) {
    try {
      const bucket = process.env.WASABI_BUCKET;
      const parts = mapped.AudioUrl.split(`${bucket}/`);
      if (parts.length > 1) {
        mapped.AudioUrl = await storage.getSignedUrl(parts[1]);
      }
    } catch (e) {
      console.warn("Failed to sign Wasabi URL on approve:", e.message);
    }
  }

  return mapped;
};

const rejectRecording = async (id) => {
  const updated = await Recording.findByIdAndUpdate(
    id,
    { isApproved: 2 },
    { new: true }
  );
  if (!updated) throw new Error("Recording not found");
  return mapRecording(updated);
};

const getRecordingsByStatus = async (status) => {
  const validStatuses = [0, 1, 2, 3];
  if (!validStatuses.includes(Number(status))) {
    throw new Error("Status không hợp lệ. Chỉ chấp nhận: 0, 1, 2, 3");
  }

  const recordings = await Recording.find({ isApproved: Number(status) })
    .sort({ createdAt: -1 });

  return Promise.all(recordings.map(async (r) => {
    const m = mapRecording(r);
    if (m.AudioUrl && (m.AudioUrl.includes('wasabisys.com') || m.AudioUrl.includes('s3.'))) {
      try {
        const bucket = process.env.WASABI_BUCKET;
        const parts = m.AudioUrl.split(`${bucket}/`);
        if (parts.length > 1) {
          m.AudioUrl = await storage.getSignedUrl(parts[1]);
        }
      } catch (err) {
        console.warn("Failed to sign Wasabi URL on getByStatus:", err.message);
      }
    }
    return m;
  }));
};

// DELETE recording
const deleteRecording = async (id) => {
  const recording = await Recording.findById(id);
  if (!recording) throw new Error("Recording not found");

  if (recording.audioUrl) {
    try {
      const urlParts = recording.audioUrl.split("/");
      const publicIdWithExtension = urlParts.slice(-1)[0];
      const publicId = publicIdWithExtension.split(".")[0];
      const fullPublicId = `lesson_audio/${publicId}`;
      await cloudinary.uploader.destroy(fullPublicId, { resource_type: "video" });
    } catch (error) {
      console.error("Lỗi khi xóa file từ Cloudinary:", error.message);
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
