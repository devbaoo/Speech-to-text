const sentenceStatsService = require("../services/sentenceStats.service");

exports.getCreatorTotals = async (req, res) => {
  try {
    const stats = await sentenceStatsService.getCreatorTotals();

    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
