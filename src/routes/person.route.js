const express = require("express");
const router = express.Router();
const controller = require("../controllers/person.controller");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");

router.post("/", controller.createGuestUser);
router.get("/", controller.getAll);
router.get("/top-recorders", controller.getTopRecorders);
router.get("/top-sentence-contributors", controller.getTopSentenceContributors);
router.get("/top-contributors", controller.getTopContributors);
router.get("/top-sentence-recorders", controller.getTopSentenceRecorders);
router.get("/total-contributions", controller.getTotalUserContributions);
router.post("/login", controller.loginUser);
router.post("/approve-recordings", controller.approveRecordingsByEmail);
router.get("/:id", controller.getUserById);
router.put("/:id", verifyAdminOrManager, controller.updateUser);
router.delete("/:id", verifyAdminOrManager, controller.deleteUser);

module.exports = router;
