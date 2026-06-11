const NewSentence = require("../models/newSentence");
const NewRecording = require("../models/newRecording");
const { mapNewSentence } = require("../utils/newSentence.mapper");

// Get all new sentences with pagination
exports.getSentences = async (page = 1, limit = 20, status = null) => {
    const skip = (page - 1) * limit;
    const filterQuery = {};
    if (status !== null && status !== undefined) {
        filterQuery.status = parseInt(status);
    }

    const rows = await NewSentence.find(filterQuery)
        .select("domainCode topic sentenceOrder content status createdBy createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    const totalCount = await NewSentence.countDocuments(filterQuery);

    const pendingCount = await NewSentence.countDocuments({ status: 0 });
    const activeCount = await NewSentence.countDocuments({ status: 1 });

    return {
        sentences: rows.map(mapNewSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        pendingCount,
        activeCount
    };
};

// Get available sentences (status = 1) that user hasn't recorded yet
exports.getAvailableSentences = async (page = 1, limit = 50, personId = null) => {
    const skip = (page - 1) * limit;

    // Get all sentence IDs that user has already recorded
    let recordedSentenceIds = [];
    if (personId) {
        const recordings = await NewRecording.find({ personId }).select("sentenceId").lean();
        recordedSentenceIds = recordings.map(r => r.sentenceId);
    }

    // Filter: status = 1 AND not recorded by this user
    const filterQuery = { status: 1 };
    if (recordedSentenceIds.length > 0) {
        filterQuery._id = { $nin: recordedSentenceIds };
    }

    const rows = await NewSentence.find(filterQuery)
        .select("domainCode topic sentenceOrder content status createdBy createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const totalCount = await NewSentence.countDocuments(filterQuery);

    return {
        sentences: rows.map(mapNewSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page
    };
};

// Get sentence by ID
exports.getSentenceById = async (id) => {
    const sentence = await NewSentence.findById(id);
    if (!sentence) {
        throw new Error("Sentence không tồn tại");
    }
    return mapNewSentence(sentence);
};

// Create new sentence
exports.createSentence = async (data) => {
    const { domainCode, topic, sentenceOrder, content, status = 1, createdBy = null } = data;
    
    if (!domainCode || !topic || !sentenceOrder || !content) {
        throw new Error("domainCode, topic, sentenceOrder, content là bắt buộc");
    }

    const sentence = await NewSentence.create({
        domainCode,
        topic,
        sentenceOrder,
        content,
        status,
        createdBy
    });

    return mapNewSentence(sentence);
};

// Create multiple sentences
exports.createSentences = async (sentencesData) => {
    const toInsert = [];
    const errors = [];

    for (const data of sentencesData) {
        const { domainCode, topic, sentenceOrder, content, createdBy } = data;
        
        if (!domainCode || !topic || !sentenceOrder || !content) {
            errors.push({ data, error: "Thiếu trường bắt buộc" });
            continue;
        }

        toInsert.push({
            domainCode,
            topic,
            sentenceOrder,
            content,
            status: data.status || 1,
            createdBy: createdBy || null
        });
    }

    if (toInsert.length === 0) {
        throw new Error("Không có sentence nào hợp lệ để tạo");
    }

    const inserted = await NewSentence.insertMany(toInsert, { ordered: false });
    return {
        created: inserted.map(mapNewSentence),
        errors: errors.length > 0 ? errors : undefined
    };
};

// Update sentence
exports.updateSentence = async (id, data) => {
    const existingSentence = await NewSentence.findById(id);
    if (!existingSentence) {
        throw new Error("Sentence không tồn tại");
    }

    const updateFields = {};
    if (data.domainCode !== undefined) updateFields.domainCode = data.domainCode;
    if (data.topic !== undefined) updateFields.topic = data.topic;
    if (data.sentenceOrder !== undefined) updateFields.sentenceOrder = data.sentenceOrder;
    if (data.content !== undefined) updateFields.content = data.content;
    if (data.status !== undefined) updateFields.status = data.status;

    const sentence = await NewSentence.findByIdAndUpdate(
        id,
        updateFields,
        { new: true }
    );

    return mapNewSentence(sentence);
};

// Delete sentence
exports.deleteSentence = async (id) => {
    const sentence = await NewSentence.findByIdAndDelete(id);
    if (!sentence) {
        throw new Error("Sentence không tồn tại");
    }
    return mapNewSentence(sentence);
};

// Get sentences by domainCode
exports.getSentencesByDomain = async (domainCode, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    
    const rows = await NewSentence.find({ domainCode })
        .select("domainCode topic sentenceOrder content status createdBy createdAt")
        .sort({ domainCode: 1, topic: 1, sentenceOrder: 1 })
        .skip(skip)
        .limit(limit);
    
    const totalCount = await NewSentence.countDocuments({ domainCode });

    return {
        sentences: rows.map(mapNewSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        domainCode
    };
};

// Get sentences by topic
exports.getSentencesByTopic = async (domainCode, topic, page = 1, limit = 20) => {
    const skip = (page - 1) * limit;
    
    const rows = await NewSentence.find({ domainCode, topic })
        .select("domainCode topic sentenceOrder content status createdBy createdAt")
        .sort({ sentenceOrder: 1 })
        .skip(skip)
        .limit(limit);
    
    const totalCount = await NewSentence.countDocuments({ domainCode, topic });

    return {
        sentences: rows.map(mapNewSentence),
        count: rows.length,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        domainCode,
        topic
    };
};

// Get distinct domains
exports.getDomains = async () => {
    const domains = await NewSentence.distinct("domainCode");
    return domains;
};

// Get topics by domain
exports.getTopicsByDomain = async (domainCode) => {
    const topics = await NewSentence.distinct("topic", { domainCode });
    return topics;
};
