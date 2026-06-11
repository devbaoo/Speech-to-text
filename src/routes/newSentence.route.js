const express = require("express");
const router = express.Router();

const newSentenceController = require("../controllers/newSentence.controller");
const newSentenceService = require("../services/newSentence.service");
const { verifyAdminOrManager } = require("../middlewares/admin.middleware");
const storage = require("../services/storage");
const archiver = require("archiver");

// Public routes
router.get("/", newSentenceController.getAll);
router.get("/domains", newSentenceController.getDomains);
router.get("/available", newSentenceController.getAvailableSentences);

// Download sentences
router.get("/download", async (req, res) => {
    try {
        const NewRecording = require("../models/newRecording");
        const NewSentence = require("../models/newSentence");
        const mode = (req.query.mode || "all").toString();
        const limit = parseInt(req.query.limit) || 1000;

        const sentenceFilter = {};
        if (mode === "approved") {
            sentenceFilter.status = 1;
        }

        const sentences = await NewSentence.find(sentenceFilter)
            .select("domainCode topic sentenceOrder content status createdBy createdAt")
            .limit(limit)
            .lean();

        if (!sentences.length) {
            return res.status(404).json({ message: "No sentences to download" });
        }

        res.setHeader("Content-Disposition", `attachment; filename="sentences_${mode}.zip"`);
        res.setHeader("Content-Type", "application/zip");

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.pipe(res);

        for (const sentence of sentences) {
            // Tạo tên file theo format: [domainCode]-[topic]-[sentenceOrder]
            const fileName = `${sentence.domainCode}-${sentence.topic}-${sentence.sentenceOrder}`;
            
            // Tạo file markdown với nội dung
            const mdContent = `---
domainCode: ${sentence.domainCode}
topic: ${sentence.topic}
sentenceOrder: ${sentence.sentenceOrder}
status: ${sentence.status}
createdBy: ${sentence.createdBy || "System"}
createdAt: ${sentence.createdAt}
---

# Sentence Content

${sentence.content}
`;
            archive.append(mdContent, {
                name: `text/${fileName}.md`
            });
        }

        await archive.finalize();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});

// User create sentence endpoint
router.post("/user", newSentenceController.createUserSentence);

// Protected routes (admin/manager)
router.get("/:id", newSentenceController.getById);
router.post("/", verifyAdminOrManager, newSentenceController.createSentence);
router.post("/bulk", verifyAdminOrManager, newSentenceController.createSentences);
router.put("/:id", verifyAdminOrManager, newSentenceController.updateSentence);
router.delete("/:id", verifyAdminOrManager, newSentenceController.deleteSentence);

module.exports = router;
