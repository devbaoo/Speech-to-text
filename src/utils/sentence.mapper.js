const Sentence = require("../models/sentence");

exports.mapSentence = (row) => {
    return {
        SentenceID: row._id,
        Content: row.content,
        CreatedAt: row.createdAt,
        Status: row.status,
        CreatedBy: row.createdBy || null,
    };
};


