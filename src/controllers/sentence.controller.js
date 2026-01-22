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
        const audioStream = await axios.get(rec.AudioUrl, {
          responseType: "stream"
        });

        // place all audio files directly under audio/ with unique filename by recording id
        archive.append(audioStream.data, {
          name: `audio/${rec.RecordingID}.wav`
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

    const sentences = await sentenceService.getSentencesByStatus(status);

    res.json({
      status: Number(status),
      count: sentences.length,
      data: sentences
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
};


exports.getAll = async (req, res) => {
  try {
    const sentences = await sentenceService.getSentences();
    res.json({
      count: sentences.length,
      data: sentences
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
