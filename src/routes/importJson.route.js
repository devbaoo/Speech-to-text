const express = require('express');
const router = express.Router();
const { importJson, importJsonByUrl, importNewSentenceText } = require('../controllers/importJson.controller');
const upload = require('../services/storage/importUpload.config');
const uploadText = require('../services/storage/importTextUpload.config');

router.post('/upload', upload.single('file'), importJson);

router.post('/upload-url', importJsonByUrl);

router.post('/new-user/upload', uploadText.single('file'), importNewSentenceText);

module.exports = router;
