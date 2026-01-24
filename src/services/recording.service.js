const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const Recording = require("../models/recording");
const Sentence = require("../models/sentence");
const Person = require("../models/person"); // Import để đảm bảo model được đăng ký
const { mapRecording } = require("../utils/recording.mapper");

// upload audio
const uploadWavAudio = async (file) => {
  if (!file || !file.path) throw new Error("Không có dữ liệu audio");

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: "video",
      folder: "lesson_audio",
      format: "wav",
      use_filename: true,
      unique_filename: true,
    });
    return {
      audioUrl: result.secure_url,
      publicId: result.public_id,
      duration: result.duration,
    };
  } catch (error) {
    throw error;
  }
};

// GET ALL 
const getAllRecordings = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  
  // Get paginated recordings with populated personId and sentenceId
  const recordings = await Recording.find()
    .populate("personId", "email")
    .populate("sentenceId", "content")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  
  // Get total count for metadata (using countDocuments for large collections)
  const totalCount = await Recording.countDocuments();

  // Global stats for recordings that have isApproved = 1 (đã duyệt)
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
  const mapped = recordings.map(mapRecording);
  const totalDurationSeconds = recordings.reduce((acc, r) => acc + (r.duration || 0), 0);
  const totalDurationHours = totalDurationSeconds / 3600;

  return {
    recordings: mapped,
    count: mapped.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: page,
    totalDurationSeconds,
    totalDurationHours,
    approvedCount,
    approvedDurationSeconds,
    approvedDurationHours,
    pendingCount,
    rejectedCount
  };
};

// APPROVE recording (set isApproved = 1 và update sentence status = 2)
const approveRecording = async (id) => {
  const recording = await Recording.findById(id);
  if (!recording) throw new Error("Recording not found");
  const sentence = await Sentence.findById(recording.sentenceId);
  if (!sentence) throw new Error("Sentence not found");

  // Also check if current sentence already has status=2 (defensive)
  if (sentence.status === 2) {
    await Recording.findByIdAndUpdate(id, { isApproved: 3 });
    throw new Error("Sentence này đã có recording được duyệt, không thể duyệt thêm recording khác");
  }

  // Check duplicates: is there another sentence with same content already approved (status = 2)?
  // Use simpler matching without expensive regex operations
  const normalizedContent = sentence.content.trim().toLowerCase();
  const dup = await Sentence.findOne({
    _id: { $ne: sentence._id },
    status: 2,
    // Note: For better performance, consider adding a denormalized 'contentLower' field
    contentLower: normalizedContent
  });

  if (dup) {
    // Mark recording as cannot approve and mark the sentence as rejected
    await Recording.findByIdAndUpdate(id, { isApproved: 3 });
    await Sentence.findByIdAndUpdate(sentence._id, { status: 3 });
    throw new Error("Đã tồn tại sentence đã được duyệt khác giống nội dung này; recording không thể duyệt");
  }

  const updatedRecording = await Recording.findByIdAndUpdate(
    id,
    { isApproved: 1 },
    { new: true }
  );
  await Sentence.findByIdAndUpdate(
    recording.sentenceId,
    { status: 2 }
  );

  return mapRecording(updatedRecording);
};

// REJECT recording (set isApproved = 2)
const rejectRecording = async (id) => {
  const updated = await Recording.findByIdAndUpdate(
    id,
    { isApproved: 2 },
    { new: true } 
  );
  if (!updated) throw new Error("Recording not found");
  return mapRecording(updated);
};

// Get recordings by isApproved status
const getRecordingsByStatus = async (status) => {
  const validStatuses = [0, 1, 2, 3];
  if (!validStatuses.includes(Number(status))) {
    throw new Error("Status không hợp lệ. Chỉ chấp nhận: 0, 1, 2, 3");
  }

  const recordings = await Recording.find({ isApproved: Number(status) })
    .sort({ createdAt: -1 });

  return recordings.map(mapRecording);
};

module.exports = {
  uploadWavAudio,
  getAllRecordings,
  approveRecording,
  rejectRecording,
  getRecordingsByStatus,
};
