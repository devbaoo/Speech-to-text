const Sentence = require("../models/sentenceNew");
const { mapSentence } = require("../utils/sentenceNew.mapper");
const Recording = require("../models/recordingNew");

// Tách plainText khỏi content (bỏ [vi], [en], v.v.)
const extractPlainText = (content) => {
    return content.replace(/\[(vi|en|jp|ko|zh)\]/gi, "").trim();
};

// Create sentence
exports.createSentence = async (content, plainText = null) => {
    if (!content) {
        throw new Error("Content is required");
    }
    const sentences = content
        .split(/}/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const toCreate = [];
    const dupes = [];

    for (const text of sentences) {
        const normalizedText = text.toLowerCase().trim();
        const exists = await Sentence.findOne({
            content: normalizedText
        });

        if (exists) {
            dupes.push({ content: text, id: exists._id });
        } else {
            toCreate.push({
                content: text,
                plainText: plainText !== null ? plainText : extractPlainText(text),
                status: 1
            });
        }
    }

    if (dupes.length) {
        const dupeList = dupes.map(d => d.content).join(', ');
        throw new Error(`Duplicate sentences exist: ${dupeList}`);
    }

    return await Sentence.insertMany(toCreate);
};

// Get all sentence with pagination
exports.getSentences = async (page = 1, limit = 20, status = null) => {
    const skip = (page - 1) * limit;
    const filterQuery = {};
    if (status !== null && status !== undefined) {
        filterQuery.status = status;
    }

    const rows = await Sentence.find(filterQuery)
        .select("content plainText createdAt status createdBy")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    const totalCount = await Sentence.countDocuments(filterQuery);

    const pendingCount = await Sentence.countDocuments({ status: 0 });
    const approvedCount = await Sentence.countDocuments({ status: 1 });
    const rejectedCount = await Sentence.countDocuments({ status: 3 });
    const recordedCount = await Sentence.countDocuments({ status: 2 });

    return {
        sentences: rows.map(mapSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        pendingCount,
        approvedCount,
        rejectedCount,
        recordedCount
    };
};

// Create sentence for user (status = 0)
exports.createUserSentence = async (content, userName = null, personId = null, plainText = null) => {
    if (!content) {
        throw new Error("Content is required");
    }

    const sentences = content
        .split(/}/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const toInsert = [];
    const skipped = [];

    for (const text of sentences) {
        const normalizedText = text.toLowerCase().trim();
        const exists = await Sentence.findOne({
            content: normalizedText
        });
        if (exists) {
            skipped.push({ content: text, existingId: exists._id });
            continue;
        }
        toInsert.push({
            content: text,
            plainText: plainText !== null ? plainText : extractPlainText(text),
            status: 0,
            createdBy: userName || null,
        });
    }

    const created = toInsert.length ? await Sentence.insertMany(toInsert) : [];

    return { created, skipped };
};

const mapDownloadRow = (doc) => ({
    sentenceId: doc._id.toString(),
    plain_text: doc.plainText || null,
    text_annotation: doc.content
});

// Download sentences for different modes:
// mode = 'all' -> all sentences (0,1,2,3) with recordings if any
// mode = 'with-audio' -> sentences that have recordings with isApproved IN (0,1)
// mode = 'approved' -> sentences that have recording.isApproved = 1 AND sentence.status = 2
exports.downloadSentences = async (mode = "all") => {
    mode = mode || "all";

    if (mode === "all") {
        const sentences = await Sentence.find()
            .select("content plainText createdAt status createdBy")
            .sort({ createdAt: -1 });

        const sentenceIds = sentences.map(s => s._id);
        const recordings = await Recording.find({ sentenceId: { $in: sentenceIds } })
            .select("audioUrl isApproved recordedAt personId sentenceId")
            .sort({ recordedAt: -1 });

        const recordingsBySentence = {};
        recordings.forEach(r => {
            const sid = r.sentenceId.toString();
            recordingsBySentence[sid] = recordingsBySentence[sid] || [];
            recordingsBySentence[sid].push({
                RecordingID: r._id,
                AudioUrl: r.audioUrl,
                IsApproved: r.isApproved,
                RecordedAt: r.recordedAt,
                PersonID: r.personId
            });
        });

        return sentences.map(s => ({
            ...mapDownloadRow(s),
            recordings: recordingsBySentence[s._id.toString()] || []
        }));
    }

    if (mode === "with-audio") {
        const recordings = await Recording.find({ isApproved: { $in: [0, 1] } })
            .populate("sentenceId", "content plainText status createdAt createdBy")
            .sort({ recordedAt: -1 });

        const mapBySentence = {};
        recordings.forEach(r => {
            if (!r.sentenceId) return;
            const sid = r.sentenceId._id.toString();
            mapBySentence[sid] = mapBySentence[sid] || {
                ...mapDownloadRow(r.sentenceId),
                recordings: []
            };
            mapBySentence[sid].recordings.push({
                RecordingID: r._id,
                AudioUrl: r.audioUrl,
                IsApproved: r.isApproved,
                RecordedAt: r.recordedAt,
                PersonID: r.personId
            });
        });

        return Object.values(mapBySentence);
    }

    if (mode === "approved") {
        const recordings = await Recording.find({ isApproved: 1 })
            .populate("sentenceId", "content plainText status createdAt createdBy")
            .sort({ recordedAt: -1 });

        const mapBySentence = {};
        recordings.forEach(r => {
            if (!r.sentenceId) return;
            if (r.sentenceId.status !== 2) return;
            const sid = r.sentenceId._id.toString();
            mapBySentence[sid] = mapBySentence[sid] || {
                ...mapDownloadRow(r.sentenceId),
                recordings: []
            };
            mapBySentence[sid].recordings.push({
                RecordingID: r._id,
                AudioUrl: r.audioUrl,
                IsApproved: r.isApproved,
                RecordedAt: r.recordedAt,
                PersonID: r.personId
            });
        });

        return Object.values(mapBySentence);
    }

    throw new Error("Unknown download mode");
};

// Approve sentence (change status from 0 to 1)
exports.approveSentence = async (id) => {
    const sentence = await Sentence.findByIdAndUpdate(
        id,
        { status: 1 },
        { new: true }
    );

    if (!sentence) {
        throw new Error("Sentence không tồn tại");
    }

    return sentence;
};

// Reject sentence (delete sentence)
exports.rejectSentence = async (id) => {
    const sentence = await Sentence.findByIdAndUpdate(
        id,
        { status: 3 },
        { new: true }
    );

    if (!sentence) {
        throw new Error("Sentence không tồn tại");
    }

    return sentence;
};

// Delete sentence and its recordings
exports.deleteSentence = async (id) => {
    const sent = await Sentence.findByIdAndDelete(id);
    if (!sent) {
        throw new Error("Sentence không tồn tại");
    }
    await Recording.deleteMany({ sentenceId: id });
    return sent;
};

// Get sentences by status with pagination
exports.getSentencesByStatus = async (status, page = 1, limit = 20) => {
    const validStatuses = [0, 1, 2, 3];
    if (!validStatuses.includes(Number(status))) {
        throw new Error("Status không hợp lệ. Chỉ chấp nhận: 0, 1, 2, 3");
    }

    const skip = (page - 1) * limit;
    const rows = await Sentence.find({ status: Number(status) })
        .select("content plainText createdAt status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalCount = await Sentence.countDocuments({ status: Number(status) });

    return {
        sentences: rows.map(mapSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        status: Number(status)
    };
};

// Update sentence
exports.updateSentence = async (id, data) => {
    if (!data.content || data.content.trim() === "") {
        throw new Error("Content không được rỗng");
    }
    const existingSentence = await Sentence.findById(id);
    if (!existingSentence) {
        throw new Error("Sentence không tồn tại");
    }

    const updateFields = { content: data.content };
    if (data.plainText !== undefined) {
        updateFields.plainText = data.plainText;
    }

    const sentence = await Sentence.findByIdAndUpdate(
        id,
        updateFields,
        { new: true }
    );

    return sentence;
};

// Approve all pending sentences (status = 0)
exports.approveAllPending = async () => {
    const pending = await Sentence.find({ status: 0 }).sort({ createdAt: 1 });

    const approved = [];
    const rejected = [];

    for (const s of pending) {
        const normalizedContent = s.content.toLowerCase().trim();
        const dup = await Sentence.findOne({
            _id: { $ne: s._id },
            content: normalizedContent,
            status: { $in: [1, 2] }
        });

        if (dup) {
            await Sentence.findByIdAndUpdate(s._id, { status: 3 });
            rejected.push({ id: s._id, content: s.content, reason: "Duplicate exists" });
        } else {
            await Sentence.findByIdAndUpdate(s._id, { status: 1 });
            approved.push({ id: s._id, content: s.content });
        }
    }

    return { approved, rejected, totalPending: pending.length };
};

// Get approved sentences that don't have any recordings
exports.getApprovedSentencesWithoutRecordings = async (page = 1, limit = 20) => {
    const skip = (page - 1) * limit;

    const sentencesWithRecordings = await Recording.distinct("sentenceId");

    const filterQuery = {
        status: 1,
        _id: { $nin: sentencesWithRecordings }
    };

    const rows = await Sentence.find(filterQuery)
        .select("content plainText createdAt status createdBy")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalCount = await Sentence.countDocuments(filterQuery);

    return {
        sentences: rows.map(mapSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
    };
};
