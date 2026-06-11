const NewSentence = require("../models/newSentence");

exports.mapNewSentence = (row) => {
    return {
        Id: row._id,
        DomainCode: row.domainCode,
        Topic: row.topic,
        SentenceOrder: row.sentenceOrder,
        Content: row.content,
        Status: row.status,
        CreatedBy: row.createdBy || null,
        CreatedAt: row.createdAt,
    };
};
