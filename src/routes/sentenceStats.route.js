const express = require("express");
const router = express.Router();

const sentenceStatsController = require("../controllers/sentenceStats.controller");

router.get("/creator-totals", sentenceStatsController.getCreatorTotals);

module.exports = router;
