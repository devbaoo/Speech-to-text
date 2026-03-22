const Sentence = require("../models/sentenceNew");

exports.mapSentence = (row) => {
    return {
        SentenceID: row._id,
        Content: row.content,
        PlainText: row.plainText || null,
        CreatedAt: row.createdAt,
        Status: row.status,
        CreatedBy: row.createdBy || null,
    };
};
