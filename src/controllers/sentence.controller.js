const sentenceService = require("../services/sentence.service");
const axios = require("axios");
const archiver = require("archiver"); 

exports.createSentence = async (req, res) => {
  try {
    const { content } = req.body;

    const sentence = await sentenceService.createSentence(content);

    res.status(201).json({
      message: "Sentence created successfully",
      data: sentence
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};

const Person = require("../models/person");

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

    const result = await sentenceService.createUserSentence(content, userEmail, personId);

    const createdCount = (result.created || []).length;
    const skippedCount = (result.skipped || []).length;

    if (createdCount > 0 && skippedCount === 0) {
      return res.status(201).json({
        message: `Created ${createdCount} sentence(s)`,
        data: result
      });
    }

    if (createdCount > 0 && skippedCount > 0) {
      return res.status(201).json({
        message: `Created ${createdCount} sentence(s), skipped ${skippedCount} duplicate(s)`,
        data: result
      });
    }

    // createdCount === 0 && skippedCount > 0
    return res.status(409).json({
      message: `All sentences are duplicates; ${skippedCount} duplicate(s) found`,
      duplicates: result.skipped
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};

// Helper function to download and convert audio to standard PCM WAV format
const convertToPcmWav = async (audioUrl) => {
  const axios = require("axios");
  const path = require("path");
  const fs = require("fs");
  const ffmpeg = require("fluent-ffmpeg");
  const os = require("os");
  const ffmpegStatic = require("ffmpeg-static");
  
  if (!audioUrl) return null;
  
  ffmpeg.setFfmpegPath(ffmpegStatic);
  
  const tempDir = path.join(os.tmpdir(), "audio_convert");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempInput = path.join(tempDir, `input_${Date.now()}.mp4`);
  const tempOutput = path.join(tempDir, `output_${Date.now()}.wav`);
  
  try {
    const response = await axios.get(audioUrl, {
      responseType: "stream",
      timeout: 60000
    });
    
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(tempInput);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("error", reject)
        .on("end", resolve)
        .save(tempOutput);
    });
    
    const wavBuffer = fs.readFileSync(tempOutput);
    
    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);
    
    return wavBuffer;
  } catch (error) {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    throw error;
  }
};

// Download sentences for export modes: all | with-audio | approved
exports.downloadSentences = async (req, res) => {
  try {
    const mode = (req.query.mode || "all").toString();
    const allowed = ["all", "with-audio", "approved"];

    if (!allowed.includes(mode)) {
      return res.status(400).json({
        message: "Invalid mode. Allowed: all, with-audio, approved"
      });
    }

    const data = await sentenceService.downloadSentences(mode);

    if (!data.length) {
      return res.status(404).json({ message: "No data to download" });
    }
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sentences_${mode}.zip"`
    );
    res.setHeader("Content-Type", "application/zip");
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const item of data) {
      archive.append(item.sentence.Content + "\n", {
        name: `text/${item.sentence.SentenceID}.txt`
      });
      for (const rec of item.recordings || []) {
        // Download audio directly
        const response = await axios.get(rec.AudioUrl, {
          responseType: "arraybuffer",
          timeout: 60000
        });

        // place all audio files under audio/ with format: {SentenceID}_{RecordingID}.wav
        const sentenceId = item.sentence.SentenceID;
        const recordingId = rec.RecordingID;
        archive.append(response.data, {
          name: `audio/${sentenceId}_${recordingId}.wav`
        });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.approveSentence = async (req, res) => {
  try {
    const { id } = req.params;

    const sentence = await sentenceService.approveSentence(id);

    res.json({
      message: "Sentence approved successfully",
      data: sentence
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};

exports.rejectSentence = async (req, res) => {
  try {
    const { id } = req.params;

    const sentence = await sentenceService.rejectSentence(id);

    res.json({
      message: "Sentence rejected successfully",
      rejectedSentence: {
        id: sentence._id,
        content: sentence.content,
        status: sentence.status
      }
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};

exports.getSentencesByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const result = await sentenceService.getSentencesByStatus(status, page, limit);

    res.json({
      status: result.status,
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      data: result.sentences
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};


exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    // Support both status and Status (case-insensitive)
    const status = (req.query.status !== undefined || req.query.Status !== undefined) 
      ? parseInt(req.query.status || req.query.Status) 
      : null;
    
    const result = await sentenceService.getSentences(page, limit, status);
    res.json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      pendingCount: result.pendingCount,
      approvedCount: result.approvedCount,
      rejectedCount: result.rejectedCount,
      recordedCount: result.recordedCount,
      data: result.sentences
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateSentence = async (req, res) => {
  try {
    const result = await sentenceService.updateSentence(
      req.params.id,
      req.body
    );
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.deleteSentence = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await sentenceService.deleteSentence(id);
    res.json({
      message: "Sentence deleted successfully",
      deletedId: deleted._id
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Approve all pending sentences
exports.approveAll = async (req, res) => {
  try {
    const result = await sentenceService.approveAllPending();
    res.json({
      message: "Approve all processed",
      result
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get approved sentences without recordings
exports.getApprovedSentencesWithoutRecordings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    
    const result = await sentenceService.getApprovedSentencesWithoutRecordings(page, limit);
    
    res.json({
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      data: result.sentences
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: err.message 
    });
  }
};
