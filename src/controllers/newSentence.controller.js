const newSentenceService = require("../services/newSentence.service");
const Person = require("../models/person");

// Get all sentences
exports.getAll = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const status = req.query.status !== undefined ? parseInt(req.query.status) : null;

        const result = await newSentenceService.getSentences(page, limit, status);
        res.json({
            count: result.count,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
            currentPage: result.currentPage,
            pendingCount: result.pendingCount,
            activeCount: result.activeCount,
            data: result.sentences
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get sentence by ID
exports.getById = async (req, res) => {
    try {
        const sentence = await newSentenceService.getSentenceById(req.params.id);
        res.json({ data: sentence });
    } catch (err) {
        res.status(404).json({ message: err.message });
    }
};

// Create single sentence
exports.createSentence = async (req, res) => {
    try {
        const sentence = await newSentenceService.createSentence(req.body);
        res.status(201).json({
            message: "Tạo sentence thành công",
            data: sentence
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Create multiple sentences
exports.createSentences = async (req, res) => {
    try {
        const { sentences } = req.body;
        if (!Array.isArray(sentences)) {
            return res.status(400).json({ message: "sentences phải là array" });
        }
        const result = await newSentenceService.createSentences(sentences);
        res.status(201).json({
            message: `Tạo ${result.created.length} sentence(s)`,
            data: result
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Update sentence
exports.updateSentence = async (req, res) => {
    try {
        const sentence = await newSentenceService.updateSentence(req.params.id, req.body);
        res.json({
            message: "Cập nhật thành công",
            data: sentence
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Delete sentence
exports.deleteSentence = async (req, res) => {
    try {
        const deleted = await newSentenceService.deleteSentence(req.params.id);
        res.json({
            message: "Xóa sentence thành công",
            data: deleted
        });
    } catch (err) {
        res.status(404).json({ message: err.message });
    }
};

// Get sentences by domain
exports.getByDomain = async (req, res) => {
    try {
        const { domainCode } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        const result = await newSentenceService.getSentencesByDomain(domainCode, page, limit);
        res.json({
            count: result.count,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
            currentPage: result.currentPage,
            domainCode: result.domainCode,
            data: result.sentences
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get sentences by topic
exports.getByTopic = async (req, res) => {
    try {
        const { domainCode, topic } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);

        const result = await newSentenceService.getSentencesByTopic(domainCode, topic, page, limit);
        res.json({
            count: result.count,
            totalCount: result.totalCount,
            totalPages: result.totalPages,
            currentPage: result.currentPage,
            domainCode: result.domainCode,
            topic: result.topic,
            data: result.sentences
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get all domains
exports.getDomains = async (req, res) => {
    try {
        const domains = await newSentenceService.getDomains();
        res.json({ data: domains });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Get topics by domain
exports.getTopics = async (req, res) => {
    try {
        const { domainCode } = req.params;
        const topics = await newSentenceService.getTopicsByDomain(domainCode);
        res.json({ data: topics });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Create user sentence (for user contribution)
exports.createUserSentence = async (req, res) => {
    try {
        const { content } = req.body;
        // prefer email if provided
        let userEmail = req.body.email || null;
        const personId = req.body.personId || req.body.userId;
        if (personId) {
            const person = await Person.findById(personId).select("email");
            if (person) userEmail = person.email;
        }

        // Get domainCode, topic, sentenceOrder from request body or use defaults
        const { domainCode = "GENERAL", topic = "General", sentenceOrder = "001" } = req.body;

        const sentence = await newSentenceService.createSentence({
            domainCode,
            topic,
            sentenceOrder,
            content,
            status: 0, // Default pending
            createdBy: userEmail
        });

        res.status(201).json({
            message: "Created sentence successfully",
            data: sentence
        });
    } catch (err) {
        res.status(400).json({
            message: err.message,
        });
    }
};
