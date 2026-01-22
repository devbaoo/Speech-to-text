exports.mapRecording = (row) => {
  return {
    RecordingID: row._id,
    PersonID: row.personId,
    SentenceID: row.sentenceId,
    AudioUrl: row.audioUrl,
    IsApproved: row.isApproved,
    Duration: row.duration || null,
    RecordedAt: row.recordedAt,
  };
};
