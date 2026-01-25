exports.mapRecording = (row) => {
  return {
    RecordingID: row._id,
    PersonID: row.personId?._id || row.personId,
    SentenceID: row.sentenceId?._id || row.sentenceId,
    AudioUrl: row.audioUrl,
    IsApproved: row.isApproved,
    Duration: row.duration || null,
    RecordedAt: row.recordedAt,
    Email: row.personId?.email || null,
    Content: row.sentenceId?.content || null,
    SentenceStatus: row.sentenceId?.status || null,
  };
};
