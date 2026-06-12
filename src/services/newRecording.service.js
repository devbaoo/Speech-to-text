const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const NewRecording = require("../models/newRecording");
const Sentence = require("../models/newSentence");
const Person = require("../models/person");
const UserNew = require("../models/userNew");
const { mapNewRecording } = require("../utils/newRecording.mapper");
const storage = require("./storage");

// upload audio
const uploadWavAudio = async (file) => {
  if (!file || !file.path) throw new Error("Không có dữ liệu audio");

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: "video",
      folder: "lesson_audio",
      format: "wav",
      audio_codec: "none",
      bit_rate: "192k",
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

  if (email) {
    // First try to find by email field directly on recording
    const byEmailField = await NewRecording.find({
      email: { $regex: email, $options: "i" }
    }).select("_id");

    // Also find by person email (backward compatibility)
    const persons = await Person.find({
      email: { $regex: email, $options: "i" }
    }).select("_id");

    const personIds = persons.map((p) => p._id);
    const recordingIds = byEmailField.map((r) => r._id);

    if (!personIds.length && !recordingIds.length) {
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

    filterQuery.$or = [
      { personId: { $in: personIds } },
      { _id: { $in: recordingIds } }
    ];
  }

  const recordings = await NewRecording.find(filterQuery)
    .populate("personId", "email")
    .populate("sentenceId", "domainCode topic sentenceOrder content status")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  const totalCount = await NewRecording.countDocuments(filterQuery);

  const approvedAgg = await NewRecording.aggregate([
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
  const pendingCount = await NewRecording.countDocuments({ isApproved: 0 });
  const rejectedCount = await NewRecording.countDocuments({ isApproved: 2 });

  const mapped = await Promise.all(recordings.map(async (r) => {
    const m = mapNewRecording(r);
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
  const recording = await NewRecording.findById(id);
  if (!recording) throw new Error("Recording not found");
  const sentence = await Sentence.findById(recording.sentenceId);
  if (!sentence) throw new Error("Sentence not found");

  const updatedRecording = await NewRecording.findByIdAndUpdate(
    id,
    { isApproved: 1 },
    { new: true }
  ).populate("personId", "email")
   .populate("sentenceId", "domainCode topic sentenceOrder content status");

  const mapped = mapNewRecording(updatedRecording);
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
  const updated = await NewRecording.findByIdAndUpdate(
    id,
    { isApproved: 2 },
    { new: true }
  ).populate("personId", "email")
   .populate("sentenceId", "domainCode topic sentenceOrder content status");
  if (!updated) throw new Error("Recording not found");
  return mapNewRecording(updated);
};

const getRecordingsByStatus = async (status) => {
  const validStatuses = [0, 1, 2, 3];
  if (!validStatuses.includes(Number(status))) {
    throw new Error("Status không hợp lệ. Chỉ chấp nhận: 0, 1, 2, 3");
  }

  const recordings = await NewRecording.find({ isApproved: Number(status) })
    .populate("personId", "email")
    .populate("sentenceId", "domainCode topic sentenceOrder content status")
    .sort({ createdAt: -1 });

  return Promise.all(recordings.map(async (r) => {
    const m = mapNewRecording(r);
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
  const recording = await NewRecording.findById(id);
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

  await NewRecording.findByIdAndDelete(id);

  return { message: "Recording đã được xóa thành công" };
};

// DELETE DUPLICATE RECORDINGS
const deleteDuplicateRecordings = async () => {
  try {
    const sentencesWithDuplicates = await NewRecording.aggregate([
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

    for (const item of sentencesWithDuplicates) {
      const sentenceId = item._id;
      const recordingIds = item.recordingIds;

      const recordings = await NewRecording.find({ _id: { $in: recordingIds } });

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

      const deleteResult = await NewRecording.deleteMany({ _id: { $in: recordingIds } });
      totalDeletedCount += deleteResult.deletedCount;
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

// Helper function to download and convert audio to standard PCM WAV format
const convertToPcmWav = async (audioUrl) => {
  const { convertToPcmWav: _convertToPcmWav } = require("../utils/audio.utils");
  return _convertToPcmWav(audioUrl, storage);
};

// DOWNLOAD RECORDINGS BY SPEAKER
const downloadRecordingsBySpeaker = async (emails, dateFrom, dateTo, isApproved = 1, isDownloadAll = false) => {
  const axios = require("axios");
  const path = require("path");
  const archiver = require("archiver");
  const { Readable } = require("stream");

  try {
    const emailList = Array.isArray(emails) ? emails : (emails ? [emails] : []);

    const parseDateTime = (dateStr, isEndOfDay = false) => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD or YYYY-MM-DD HH:mm:ss`);
      }
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/) && !dateStr.includes(' ') && !dateStr.includes('T')) {
        if (isEndOfDay) {
          date.setHours(23, 59, 59, 999);
        } else {
          date.setHours(0, 0, 0, 0);
        }
      }
      return date;
    };

    const dateFilter = {};
    if (dateFrom || dateTo) {
      if (dateFrom) {
        dateFilter.$gte = parseDateTime(dateFrom, false);
      }
      if (dateTo) {
        dateFilter.$lte = parseDateTime(dateTo, true);
      }
    }

    const archive = archiver("zip", { zlib: { level: 9 } });

    let totalRecordingCount = 0;
    let userIndex = 0;
    let firstRootFolder = null;

    const processRecordingsForPerson = async (personId, personEmail) => {
      const filterQuery = {};
      // Filter by isApproved if it's not null/undefined
      if (isApproved !== null && isApproved !== undefined) {
        filterQuery.isApproved = isApproved;
      }
      if (personId) {
        const ids = Array.isArray(personId) ? personId : [personId];
        filterQuery.$or = [
          { personId: { $in: ids } },
          { email: personEmail }
        ];
      }
      if (Object.keys(dateFilter).length > 0) {
        filterQuery.recordedAt = dateFilter;
      }

      const recordings = await NewRecording.find(filterQuery)
        .populate("personId", "email")
        .populate("sentenceId", "domainCode topic sentenceOrder content")
        .sort({ recordedAt: -1 });

      if (recordings.length === 0) {
        console.warn(`Không tìm thấy recordings cho: ${personEmail}`);
        return 0;
      }

      const folderName = personEmail.replace(/[@.]/g, "_");
      const now = new Date();
      const dateTimeStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const rootFolder = `recordings_${folderName}_${dateTimeStr}`;

      if (firstRootFolder === null) {
        firstRootFolder = rootFolder;
      }

      for (let i = 0; i < recordings.length; i++) {
        const recording = recordings[i];
        const sentence = recording.sentenceId;

        if (!sentence || !sentence.content) {
          continue;
        }

        const sentenceId = sentence._id.toString();
        const recordingId = recording._id.toString();
        const fileName = `${sentence.domainCode}-${sentence.topic}-${sentence.sentenceOrder}`;

        const fileNameMd = `${sentence.domainCode}-${sentence.topic}-${sentence.sentenceOrder}`;
        
        const mdContent = `---
domainCode: ${sentence.domainCode}
topic: ${sentence.topic}
sentenceOrder: ${sentence.sentenceOrder}
recordedAt: ${recording.recordedAt}
personEmail: ${recording.personId?.email || personEmail}
---

# Sentence Content

${sentence.content}
`;
        archive.append(mdContent, {
          name: `${rootFolder}/text/${fileNameMd}.md`
        });

        if (recording.audioUrl) {
          try {
            const pcmBuffer = await convertToPcmWav(recording.audioUrl);
            if (pcmBuffer) {
              archive.append(pcmBuffer, {
                name: `${rootFolder}/audio/${fileName}_${recordingId}.wav`
              });
            }
          } catch (error) {
            console.error(`Lỗi khi tải file audio ${sentenceId}_${recordingId}:`, error.message);
          }
        }
      }

      return recordings.length;
    };

    if (isDownloadAll) {
      // Download all recordings grouped by person (from both Person and UserNew)
      const allPersons = await Person.find({}).select("_id email");
      const allUserNews = await UserNew.find({}).select("_id email");
      const allUsers = [...allPersons, ...allUserNews];
      for (const person of allUsers) {
        const count = await processRecordingsForPerson(person._id, person.email);
        if (count > 0) userIndex++;
        totalRecordingCount += count;
      }
    } else {
      // Download only specified emails
      for (const emailOrId of emailList) {
        let personIds = [];
        let personEmail = emailOrId;

        const isObjectId = emailOrId.match(/^[0-9a-fA-F]{24}$/);

        if (!isObjectId) {
          // Try both Person and UserNew collections to collect all possible IDs for this email
          const person = await Person.findOne({ email: emailOrId.toLowerCase() });
          if (person) {
            personIds.push(person._id);
            personEmail = person.email;
          }
          const userNew = await UserNew.findOne({ email: emailOrId.toLowerCase() });
          if (userNew) {
            personIds.push(userNew._id);
            personEmail = userNew.email;
          }
          if (personIds.length === 0) {
            console.warn(`Người dùng không tồn tại: ${emailOrId}`);
            continue;
          }
        } else {
          personIds = [emailOrId];
        }

        const count = await processRecordingsForPerson(personIds, personEmail);
        if (count > 0) userIndex++;
        totalRecordingCount += count;
      }
    }

    if (totalRecordingCount === 0) {
      throw new Error("Không tìm thấy recordings nào cho người dùng nào");
    }

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
