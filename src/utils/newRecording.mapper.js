exports.mapNewRecording = (row) => {
  return {
    RecordingID: row._id,
    PersonID: row.personId?._id || row.personId,
    SentenceID: row.sentenceId?._id || row.sentenceId,
    AudioUrl: row.audioUrl,
    Type: row.type || null,
    IsApproved: row.isApproved,
    Duration: row.duration || null,
    RecordedAt: row.recordedAt,
    Email: row.email || row.personId?.email || null,
    DomainCode: row.sentenceId?.domainCode || null,
    Topic: row.sentenceId?.topic || null,
    SentenceOrder: row.sentenceId?.sentenceOrder || null,
    Content: row.sentenceId?.content || null,
    SentenceStatus: row.sentenceId?.status || null,
  };
};
