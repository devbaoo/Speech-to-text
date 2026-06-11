const express = require("express");
const router = express.Router();
const controller = require("../controllers/userNew.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

// Public routes
router.post("/login", controller.loginUser);
router.post("/", controller.createGuestUser);

// Protected routes
router.get("/", controller.getAll);
router.get("/search/by-email", controller.searchUserByEmail);
router.get("/top-recorders", controller.getTopRecorders);
router.get("/top-sentence-contributors", controller.getTopSentenceContributors);
router.get("/top-contributors", controller.getTopContributors);
router.get("/top-sentence-recorders", controller.getTopSentenceRecorders);
router.get("/total-contributions", controller.getTotalUserContributions);
router.post("/approve-recordings", controller.approveRecordingsByEmail);
router.get("/:id", controller.getUserById);
router.put("/:id", verifyAdminOrManager, controller.updateUser);
router.delete("/:id", verifyAdminOrManager, controller.deleteUser);

module.exports = router;
