exports.mapRecording = (row) => {
  // For backward compatibility: 
  // - If AudioPlaintext is null and recording.type is 'plaintext', use AudioUrl
  // - If AudioContent is null and recording.type is 'content' (or old data), use AudioUrl
  const audioPlaintext = row.sentenceId?.audioPlaintext || (row.type === 'plaintext' ? row.audioUrl : null) || null;
  const audioContent = row.sentenceId?.audioContent || (row.type === 'content' ? row.audioUrl : null) || null;
  
  return {
    RecordingID: row._id,
    PersonID: row.personId?._id || row.personId,
    SentenceID: row.sentenceId?._id || row.sentenceId,
    AudioUrl: row.audioUrl,
    Type: row.type || null, // 'plaintext' or 'content'
    IsApproved: row.isApproved,
    Duration: row.duration || null,
    RecordedAt: row.recordedAt,
    Email: row.personId?.email || null,
    Content: row.sentenceId?.content || null,
    PlainText: row.sentenceId?.plainText || null,
    AudioPlaintext: audioPlaintext,
    AudioContent: audioContent,
    SentenceStatus: row.sentenceId?.status || null,
    RecordingsCount: row.sentenceId?.recordingsCount || 0,
  };
};
