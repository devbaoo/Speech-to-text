const express = require('express');
const router = express.Router();
const { importJson, importJsonByUrl } = require('../controllers/importJson.controller');
const upload = require('../services/storage/importUpload.config');

router.post('/upload', upload.single('file'), importJson);

router.post('/upload-url', importJsonByUrl);

module.exports = router;
