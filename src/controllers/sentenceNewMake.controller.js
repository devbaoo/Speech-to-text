const SentenceNewMake = require("../models/sentenceNewMake");

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

// Get sentence by externalId
exports.getByExternalId = async (req, res) => {
  try {
    const { externalId } = req.params;

    const sentence = await SentenceNewMake.findOne({ externalId });

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
