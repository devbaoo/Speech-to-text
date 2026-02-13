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
const getAllRecordings = async (page = 1, limit = 20, status = null, email = null) => {
  const skip = (page - 1) * limit;
  const filterQuery = {};
  if (status !== null && status !== undefined) {
    filterQuery.isApproved = status;
  }

  // Filter by user email if provided (case-insensitive, partial match)
  if (email) {
    const persons = await Person.find({
      email: { $regex: email, $options: "i" }
    }).select("_id");

    const personIds = persons.map((p) => p._id);
    // If no users match the email search, return empty result set
    if (!personIds.length) {
      return {
        recordings: [],
        count: 0,
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
        totalDurationSeconds: 0,
        totalDurationHours: 0,
        approvedCount: 0,
        approvedDurationSeconds: 0,
        approvedDurationHours: 0,
        pendingCount: 0,
        rejectedCount: 0,
      };
    }

    filterQuery.personId = { $in: personIds };
  }

  // Get paginated recordings with populated personId and sentenceId
  const recordings = await Recording.find(filterQuery)
    .populate("personId", "email")
    .populate("sentenceId", "content")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
    const totalCount = await Recording.countDocuments(filterQuery);

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

// DELETE recording
const deleteRecording = async (id) => {
  const recording = await Recording.findById(id);
  if (!recording) throw new Error("Recording not found");

  // Xóa file audio từ Cloudinary (nếu có audioUrl)
  if (recording.audioUrl) {
    try {
      // Trích xuất public_id từ URL
      const urlParts = recording.audioUrl.split("/");
      const publicIdWithExtension = urlParts.slice(-1)[0];
      const publicId = publicIdWithExtension.split(".")[0];
      // Thêm folder path nếu cần
      const fullPublicId = `lesson_audio/${publicId}`;
      await cloudinary.uploader.destroy(fullPublicId, { resource_type: "video" });
    } catch (error) {
      console.error("Lỗi khi xóa file từ Cloudinary:", error.message);
    }
  }

  // Lưu sentenceId trước khi xóa recording
  const sentenceId = recording.sentenceId;

  // Xóa recording
  await Recording.findByIdAndDelete(id);

  // Xóa sentence tương ứng (nếu có)
  if (sentenceId) {
    await Sentence.findByIdAndDelete(sentenceId);
  }

  return { message: "Recording và sentence đã được xóa thành công" };
};

// DELETE DUPLICATE RECORDINGS (recordings thừa cho cùng 1 sentence)
const deleteDuplicateRecordings = async () => {
  try {
    // Tìm tất cả sentences có 2 hoặc nhiều recordings
    const sentencesWithDuplicates = await Recording.aggregate([
      {
        $group: {
          _id: "$sentenceId",
          count: { $sum: 1 },
          recordingIds: { $push: "$_id" }
        }
      },
      {
        $match: { count: { $gte: 2 } }
      }
    ]);

    if (sentencesWithDuplicates.length === 0) {
      return {
        success: true,
        message: "Không có sentence nào có recordings thừa",
        deletedCount: 0,
        sentencesProcessed: 0
      };
    }

    let totalDeletedCount = 0;
    let problemsWithCloudinary = [];

    // Xóa tất cả recordings cho các sentences có duplicates
    for (const item of sentencesWithDuplicates) {
      const sentenceId = item._id;
      const recordingIds = item.recordingIds;

      // Lấy tất cả recordings của sentence này
      const recordings = await Recording.find({ _id: { $in: recordingIds } });

      // Xóa audio files từ Cloudinary
      for (const recording of recordings) {
        if (recording.audioUrl) {
          try {
            const urlParts = recording.audioUrl.split("/");
            const publicIdWithExtension = urlParts.slice(-1)[0];
            const publicId = publicIdWithExtension.split(".")[0];
            const fullPublicId = `lesson_audio/${publicId}`;
            await cloudinary.uploader.destroy(fullPublicId, { resource_type: "video" });
          } catch (error) {
            console.error("Lỗi khi xóa file từ Cloudinary:", error.message);
            problemsWithCloudinary.push({
              recordingId: recording._id,
              error: error.message
            });
          }
        }
      }

      // Xóa tất cả recordings
      const deleteResult = await Recording.deleteMany({ _id: { $in: recordingIds } });
      totalDeletedCount += deleteResult.deletedCount;

      // Cập nhật sentence status về 1
      await Sentence.findByIdAndUpdate(sentenceId, { status: 1 });
    }

    return {
      success: true,
      message: "Xóa recordings thừa thành công",
      sentencesProcessed: sentencesWithDuplicates.length,
      deletedCount: totalDeletedCount,
      cloudinaryProblems: problemsWithCloudinary.length > 0 ? problemsWithCloudinary : null
    };
  } catch (error) {
    throw error;
  }
};

// DOWNLOAD RECORDINGS BY SPEAKER (as .txt + .wav files in zip)
// Support single email or array of emails (comma-separated)
const downloadRecordingsBySpeaker = async (emails, dateFrom, dateTo, isApproved = 1) => {
  const axios = require("axios");
  const path = require("path");
  const archiver = require("archiver");
  const { Readable } = require("stream");
  
  try {
    // Normalize to array
    const emailList = Array.isArray(emails) ? emails : [emails];
    
    // Helper function to parse date/datetime string
    const parseDateTime = (dateStr, isEndOfDay = false) => {
      if (!dateStr) return null;
      
      // Support formats:
      // - YYYY-MM-DD (mặc định 00:00:00, hoặc 23:59:59 nếu isEndOfDay)
      // - YYYY-MM-DD HH:mm
      // - YYYY-MM-DD HH:mm:ss
      // - YYYY-MM-DDTHH:mm:ss
      
      const date = new Date(dateStr);
      
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD or YYYY-MM-DD HH:mm:ss`);
      }
      
      // If only date is provided (no time), set time accordingly
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/) && !dateStr.includes(' ') && !dateStr.includes('T')) {
        if (isEndOfDay) {
          date.setHours(23, 59, 59, 999);
        } else {
          date.setHours(0, 0, 0, 0);
        }
      }
      
      return date;
    };
    
    // Build date filter
    const dateFilter = {};
    if (dateFrom || dateTo) {
      if (dateFrom) {
        dateFilter.$gte = parseDateTime(dateFrom, false);
      }
      if (dateTo) {
        dateFilter.$lte = parseDateTime(dateTo, true);
      }
    }

    // Create a readable stream that acts as the zip archive
    const archive = archiver("zip", { zlib: { level: 9 } });

    let totalRecordingCount = 0;
    let userIndex = 0;
    let firstRootFolder = null;

    // Process each email
    for (const emailOrId of emailList) {
      // Find person by ID or email
      let personId = emailOrId;
      let personEmail = emailOrId;
      
      // Check if it's a valid MongoDB ObjectId
      const isObjectId = emailOrId.match(/^[0-9a-fA-F]{24}$/);
      
      if (!isObjectId) {
        // It's an email, find the person
        const person = await Person.findOne({ email: emailOrId.toLowerCase() });
        if (!person) {
          console.warn(`Người dùng không tồn tại: ${emailOrId}`);
          continue;
        }
        personId = person._id;
        personEmail = person.email;
      }

      // Build query filter for this user
      const filterQuery = { personId, isApproved };
      if (Object.keys(dateFilter).length > 0) {
        filterQuery.recordedAt = dateFilter;
      }

      // Get recordings with sentence content
      const recordings = await Recording.find(filterQuery)
        .populate("sentenceId", "content")
        .sort({ recordedAt: -1 });

      if (recordings.length === 0) {
        console.warn(`Không tìm thấy recordings cho: ${personEmail}`);
        continue;
      }

      // Create folder name from email (sanitize)
      const folderName = personEmail.replace(/[@.]/g, "_");
      const now = new Date();
      const dateTimeStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const rootFolder = `recordings_${folderName}_${dateTimeStr}`;
      
      // Save first root folder for zip filename
      if (firstRootFolder === null) {
        firstRootFolder = rootFolder;
      }
      
      // Add recordings to archive in folder
      for (let i = 0; i < recordings.length; i++) {
        const recording = recordings[i];
        const sentence = recording.sentenceId;
        
        if (!sentence || !sentence.content) {
          continue;
        }

        const sentenceId = sentence._id.toString();
        const recordingId = recording._id.toString();

        // Add .txt file with sentence content in text/ folder
        archive.append(sentence.content, {
          name: `${rootFolder}/text/${sentenceId}.txt`
        });

        // Download and add .wav file from Cloudinary in audio/ folder
        if (recording.audioUrl) {
          try {
            const response = await axios.get(recording.audioUrl, {
              responseType: "arraybuffer",
              timeout: 30000
            });
            archive.append(response.data, {
              name: `${rootFolder}/audio/${sentenceId}_${recordingId}.wav`
            });
          } catch (error) {
            console.error(`Lỗi khi tải file audio ${sentenceId}_${recordingId}:`, error.message);
            // Continue with next recording even if one fails
          }
        }
      }

      totalRecordingCount += recordings.length;
      userIndex++;
    }

    if (totalRecordingCount === 0) {
      throw new Error("Không tìm thấy recordings nào cho người dùng nào");
    }

    // Finalize the archive
    archive.finalize();

    return {
      archive,
      fileName: `${firstRootFolder}.zip`,
      recordingCount: totalRecordingCount
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  uploadWavAudio,
  getAllRecordings,
  approveRecording,
  rejectRecording,
  getRecordingsByStatus,
  deleteRecording,
  deleteDuplicateRecordings,
  downloadRecordingsBySpeaker,
};
