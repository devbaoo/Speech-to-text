const SentenceNewMake = require("../models/sentenceNewMake");
const Person = require("../models/person");

// Create sentence (admin/manager)
exports.createSentence = async (req, res) => {
  try {
    const { content, plainText } = req.body;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const sentence = await SentenceNewMake.create({
      csTranscript: content,
      viEquivalent: plainText || content,
      status: 1,
      createdBy: req.user?.email || 'admin'
    });

    res.status(201).json(sentence);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create user sentence
exports.createUserSentence = async (req, res) => {
  try {
    const { email, content } = req.body;

    if (!email || !content) {
      return res.status(400).json({ message: "Email and content are required" });
    }

    // Check if person exists
    let person = await Person.findOne({ email });

    if (!person) {
      return res.status(404).json({ message: "User not found" });
    }

    const sentence = await SentenceNewMake.create({
      csTranscript: content,
      viEquivalent: content,
      status: 1,
      createdBy: email
    });

    res.status(201).json({
      message: "Sentence created successfully",
      data: [sentence]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update sentence
exports.updateSentence = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, plainText } = req.body;

    const updateData = {};
    if (content) updateData.csTranscript = content;
    if (plainText !== undefined) updateData.viEquivalent = plainText;

    const sentence = await SentenceNewMake.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!sentence) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    res.json(sentence);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Approve sentence
exports.approveSentence = async (req, res) => {
  try {
    const { id } = req.params;

    const sentence = await SentenceNewMake.findByIdAndUpdate(
      id,
      { status: 2 },
      { new: true }
    );

    if (!sentence) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    res.json(sentence);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reject sentence
exports.rejectSentence = async (req, res) => {
  try {
    const { id } = req.params;

    const sentence = await SentenceNewMake.findByIdAndUpdate(
      id,
      { status: 3 },
      { new: true }
    );

    if (!sentence) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    res.json(sentence);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete sentence
exports.deleteSentence = async (req, res) => {
  try {
    const { id } = req.params;

    const sentence = await SentenceNewMake.findByIdAndDelete(id);

    if (!sentence) {
      return res.status(404).json({ message: "Sentence not found" });
    }

    res.json({ message: "Sentence deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Download sentences
exports.downloadSentences = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};
    if (status !== undefined) {
      filter.status = parseInt(status);
    }

    const sentences = await SentenceNewMake.find(filter).sort({ createdAt: -1 });

    const data = sentences.map(s => ({
      id: s.externalId,
      cs_transcript: s.csTranscript,
      vi_equivalent: s.viEquivalent,
      status: s.status,
      domain: s.domain
    }));

    const archiver = require('archiver');
    const archive = archiver('zip');
    const chunks = [];

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('end', () => {
      const buffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="sentences.zip"');
      res.send(buffer);
    });

    archive.append(JSON.stringify(data, null, 2), { name: 'sentences.json' });
    archive.finalize();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Import JSON file (upload)
exports.importJsonFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    let jsonData;
    try {
      jsonData = JSON.parse(req.file.buffer.toString());
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON file"
      });
    }

    const sentences = jsonData.sentences || jsonData;

    if (!Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format. File must contain 'sentences' array or be an array."
      });
    }

    const importedBy = req.user?.email || req.user?.username || 'system';

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const item of sentences) {
      try {
        if (!item.id || !item.cs_transcript || !item.vi_equivalent) {
          results.errors.push({
            id: item.id || 'unknown',
            error: 'Missing required fields (id, cs_transcript, vi_equivalent)'
          });
          results.skipped++;
          continue;
        }

        const existing = await SentenceNewMake.findOne({ externalId: item.id });
        if (existing) {
          results.skipped++;
          continue;
        }

        const newRecord = new SentenceNewMake({
          externalId: item.id,
          domain: item.domain || null,
          csTranscript: item.cs_transcript,
          viEquivalent: item.vi_equivalent,
          alignment: (item.alignment || []).map(a => ({
            source: a.source,
            sourceLang: a.source_lang,
            target: a.target,
            targetLang: a.target_lang,
            relation: a.relation
          })),
          status: 1,
          createdBy: importedBy
        });

        await newRecord.save();
        results.imported++;
      } catch (err) {
        results.errors.push({
          id: item.id || 'unknown',
          error: err.message
        });
        results.skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.skipped} skipped`,
      results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Import JSON file data
exports.importJson = async (req, res) => {
  try {
    const { sentences } = req.body;

    if (!Array.isArray(sentences) || sentences.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format. 'sentences' must be a non-empty array."
      });
    }

    // Get user info from token
    const importedBy = req.user?.email || req.user?.username || 'system';

    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const item of sentences) {
      try {
        // Validate required fields
        if (!item.id || !item.cs_transcript || !item.vi_equivalent) {
          results.errors.push({
            id: item.id || 'unknown',
            error: 'Missing required fields (id, cs_transcript, vi_equivalent)'
          });
          results.skipped++;
          continue;
        }

        // Check if already exists
        const existing = await SentenceNewMake.findOne({ externalId: item.id });

        if (existing) {
          results.skipped++;
          continue;
        }

        // Create new record with fixed fields
        const newRecord = new SentenceNewMake({
          externalId: item.id,
          domain: item.domain || null,
          csTranscript: item.cs_transcript,
          viEquivalent: item.vi_equivalent,
          alignment: (item.alignment || []).map(a => ({
            source: a.source,
            sourceLang: a.source_lang,
            target: a.target,
            targetLang: a.target_lang,
            relation: a.relation
          })),
          status: 1,  // Fixed: always 1
          createdBy: importedBy  // Fixed: from logged in user
        });

        await newRecord.save();
        results.imported++;
      } catch (err) {
        results.errors.push({
          id: item.id || 'unknown',
          error: err.message
        });
        results.skipped++;
      }
    }

    res.json({
      success: true,
      message: `Import completed: ${results.imported} imported, ${results.skipped} skipped`,
      results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Get all imported sentences with pagination
exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [sentences, totalCount] = await Promise.all([
      SentenceNewMake.find()
        .sort({ importedAt: -1 })
        .skip(skip)
        .limit(limit),
      SentenceNewMake.countDocuments()
    ]);

    res.json({
      success: true,
      data: sentences,
      pagination: {
        currentPage: page,
        pageSize: limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Get sentence by externalId or _id
exports.getByExternalId = async (req, res) => {
  try {
    const { id } = req.params;

    let sentence;

    // Try to find by MongoDB _id first, then by externalId
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      sentence = await SentenceNewMake.findById(id);
    }

    if (!sentence) {
      sentence = await SentenceNewMake.findOne({ externalId: id });
    }

    if (!sentence) {
      return res.status(404).json({
        success: false,
        message: "Sentence not found"
      });
    }

    res.json({
      success: true,
      data: sentence
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Delete sentence by externalId
exports.deleteByExternalId = async (req, res) => {
  try {
    const { externalId } = req.params;

    const deleted = await SentenceNewMake.findOneAndDelete({ externalId });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Sentence not found"
      });
    }

    res.json({
      success: true,
      message: "Sentence deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Delete all sentences
exports.deleteAll = async (req, res) => {
  try {
    const result = await SentenceNewMake.deleteMany({});

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} sentences`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Get statistics
exports.getStats = async (req, res) => {
  try {
    const totalCount = await SentenceNewMake.countDocuments();

    // Count by domain
    const domainStats = await SentenceNewMake.aggregate([
      {
        $group: {
          _id: { $ifNull: ['$domain', 'unknown'] },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      stats: {
        total: totalCount,
        byDomain: domainStats
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Get approved sentences without recordings
exports.getApprovedSentencesWithoutRecordings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const sentences = await SentenceNewMake.find({ status: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCount = await SentenceNewMake.countDocuments({ status: 1 });

    res.json({
      data: sentences,
      count: sentences.length,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
