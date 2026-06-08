const cloudinary = require("cloudinary").v2;
const Recording = require("../models/recordingNewMake");
const Sentence = require("../models/sentenceNewMake");
const Person = require("../models/person");
const storage = require("./storage");

const signStorageUrl = async (url) => {
  if (!url) return url;
  if (url.includes("wasabisys.com") || url.includes("s3.")) {
    try {
      const bucket = process.env.WASABI_BUCKET;
      const parts = url.split(`${bucket}/`);
      if (parts.length > 1) {
        return await storage.getSignedUrl(parts[1]);
      }
    } catch (err) {
      console.warn("Failed to sign storage URL:", err.message);
    }
  }
  return url;
};

const convertToPcmWav = async (audioUrl) => {
  const { convertToPcmWav: convert } = require("../utils/audio.utils");
  return convert(audioUrl, storage);
};

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

    m.AudioPlaintext = await signStorageUrl(r.audioPlaintext);
    m.AudioContent = await signStorageUrl(r.audioContent);

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

  await Sentence.findByIdAndUpdate(recording.sentenceId, {
    status: 2,
    audioPlaintext: recording.audioPlaintext,
    audioContent: recording.audioContent,
  });

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

const downloadRecordingsBySpeaker = async (emails, dateFrom, dateTo, isApproved = 1) => {
  const archiver = require("archiver");

  try {
    const emailList = Array.isArray(emails) ? emails : [emails];

    const parseDateTime = (dateStr, isEndOfDay = false) => {
      if (!dateStr) return null;

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD or YYYY-MM-DD HH:mm:ss`);
      }

      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/) && !dateStr.includes(" ") && !dateStr.includes("T")) {
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
    let firstRootFolder = null;

    for (const emailOrId of emailList) {
      let personId = emailOrId;
      let personEmail = emailOrId;

      const isObjectId = emailOrId.match(/^[0-9a-fA-F]{24}$/);

      if (!isObjectId) {
        const person = await Person.findOne({ email: emailOrId.toLowerCase() });
        if (!person) {
          console.warn(`Người dùng không tồn tại: ${emailOrId}`);
          continue;
        }
        personId = person._id;
        personEmail = person.email;
      }

      const filterQuery = { personId, isApproved };
      if (Object.keys(dateFilter).length > 0) {
        filterQuery.recordedAt = dateFilter;
      }

      const recordings = await Recording.find(filterQuery)
        .populate("personId", "email")
        .populate("sentenceId", "externalId domain csTranscript viEquivalent alignment")
        .sort({ recordedAt: -1 });

      if (recordings.length === 0) {
        console.warn(`Không tìm thấy recordings cho: ${personEmail}`);
        continue;
      }

      const folderName = personEmail.replace(/[@.]/g, "_");
      const now = new Date();
      const dateTimeStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const rootFolder = `recordings_make_${folderName}_${dateTimeStr}`;

      if (firstRootFolder === null) {
        firstRootFolder = rootFolder;
      }

      for (const recording of recordings) {
        const sentence = recording.sentenceId;
        if (!sentence) {
          continue;
        }

        const sentenceId = sentence._id.toString();
        const filePrefix = sentence.externalId || sentenceId;

        const textContent = JSON.stringify({
          id: filePrefix,
          speaker: recording.personId?.email || personEmail,
          domain: sentence.domain || null,
          cs_transcript: sentence.csTranscript || "",
          vi_equivalent: sentence.viEquivalent || "",
          alignment: Array.isArray(sentence.alignment)
            ? sentence.alignment.map((item) => ({
                source: item.source || "",
                source_lang: item.sourceLang || "",
                target: item.target || "",
                target_lang: item.targetLang || "",
                relation: item.relation || "",
              }))
            : [],
        }, null, 2);

        archive.append(textContent, {
          name: `${rootFolder}/text/${filePrefix}.txt`,
        });

        if (recording.audioPlaintext) {
          try {
            const pcmBuffer = await convertToPcmWav(recording.audioPlaintext);
            if (pcmBuffer) {
              archive.append(pcmBuffer, {
                name: `${rootFolder}/audio/${filePrefix}_plain.wav`,
              });
            }
          } catch (error) {
            console.error(`Lỗi khi tải file audio plaintext ${filePrefix}_plain:`, error.message);
          }
        }

        if (recording.audioContent) {
          try {
            const pcmBuffer = await convertToPcmWav(recording.audioContent);
            if (pcmBuffer) {
              archive.append(pcmBuffer, {
                name: `${rootFolder}/audio/${filePrefix}_content.wav`,
              });
            }
          } catch (error) {
            console.error(`Lỗi khi tải file audio content ${filePrefix}_content:`, error.message);
          }
        }
      }

      totalRecordingCount += recordings.length;
    }

    if (totalRecordingCount === 0) {
      throw new Error("Không tìm thấy recordings nào cho người dùng nào");
    }

    archive.finalize();

    return {
      archive,
      fileName: `${firstRootFolder}.zip`,
      recordingCount: totalRecordingCount,
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllRecordings,
  approveRecording,
  rejectRecording,
  getRecordingsByStatus,
  deleteRecording,
  downloadRecordingsBySpeaker,
};
