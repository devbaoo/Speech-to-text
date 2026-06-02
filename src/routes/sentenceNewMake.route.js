const express = require("express");
const router = express.Router();

const sentenceNewMakeController = require("../controllers/sentenceNewMake.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

// Import JSON data
router.post("/import", verifyAdminOrManager, sentenceNewMakeController.importJson);

// Get all imported sentences with pagination
router.get("/", sentenceNewMakeController.getAll);

// Get sentence by externalId
router.get("/:externalId", sentenceNewMakeController.getByExternalId);

// Get statistics
router.get("/stats/all", sentenceNewMakeController.getStats);

// Delete sentence by externalId
router.delete("/:externalId", verifyAdminOrManager, sentenceNewMakeController.deleteByExternalId);

// Delete all sentences
router.delete("/all/delete", verifyAdminOrManager, sentenceNewMakeController.deleteAll);

module.exports = router;
