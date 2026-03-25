const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const VALID_COLLECTIONS = ['sentence', 'Person', 'person', 'sentence_new', 'recording', 'recording_new', 'user_new'];

const importJson = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng upload file JSON!' });
    }

    const { collection } = req.body;

    if (!collection) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Vui lòng cung cấp tên collection (body.collection)!' });
    }

    if (!VALID_COLLECTIONS.includes(collection)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: `Collection không hợp lệ! Các collection hợp lệ: ${VALID_COLLECTIONS.join(', ')}`
      });
    }

    let jsonData;
    try {
      const fileContent = fs.readFileSync(req.file.path, 'utf8');
      jsonData = JSON.parse(fileContent);
    } catch (parseError) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'File JSON không hợp lệ! Kiểm tra cú pháp JSON.' });
    }

    if (!Array.isArray(jsonData)) {
      jsonData = [jsonData];
    }

    if (jsonData.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'File JSON rỗng hoặc không có dữ liệu!' });
    }

    const Model = mongoose.model(collection);

    const importedCount = { success: 0, failed: 0 };
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      try {
        const raw = jsonData[i];

        const item = {
          plainText: raw.plain_text,
          content: raw.text_annotation || raw.content,
          status: raw.status !== undefined ? raw.status : 1,
          createdBy: raw.createdBy !== undefined ? raw.createdBy : null,
          __v: raw.__v,
          createdAt: raw.createdAt
        };

        await Model.create(item);
        importedCount.success++;
      } catch (itemError) {
        importedCount.failed++;
        errors.push({
          index: i,
          data: jsonData[i],
          error: itemError.message
        });
      }
    }

    fs.unlinkSync(req.file.path);

    res.status(200).json({
      message: 'Import thành công!',
      summary: {
        collection,
        total: jsonData.length,
        success: importedCount.success,
        failed: importedCount.failed
      },
      errors: importedCount.failed > 0 ? errors : undefined
    });

  } catch (error) {
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    next(error);
  }
};

const importJsonByUrl = async (req, res, next) => {
  try {
    const { url, collection } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'Vui lòng cung cấp URL file JSON (body.url)!' });
    }

    if (!collection) {
      return res.status(400).json({ message: 'Vui lòng cung cấp tên collection (body.collection)!' });
    }

    if (!VALID_COLLECTIONS.includes(collection)) {
      return res.status(400).json({
        message: `Collection không hợp lệ! Các collection hợp lệ: ${VALID_COLLECTIONS.join(', ')}`
      });
    }

    let jsonData;
    try {
      const axios = require('axios');
      const response = await axios.get(url, { timeout: 30000 });
      jsonData = response.data;
    } catch (fetchError) {
      return res.status(400).json({
        message: `Không thể tải file từ URL: ${fetchError.message}`
      });
    }

    if (!Array.isArray(jsonData)) {
      jsonData = [jsonData];
    }

    if (jsonData.length === 0) {
      return res.status(400).json({ message: 'File JSON rỗng hoặc không có dữ liệu!' });
    }

    const Model = mongoose.model(collection);

    const importedCount = { success: 0, failed: 0 };
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      try {
        const raw = jsonData[i];

        const item = {
          plainText: raw.plain_text,
          content: raw.text_annotation || raw.content,
          status: raw.status !== undefined ? raw.status : 1,
          createdBy: raw.createdBy !== undefined ? raw.createdBy : null,
          __v: raw.__v,
          createdAt: raw.createdAt
        };

        await Model.create(item);
        importedCount.success++;
      } catch (itemError) {
        importedCount.failed++;
        errors.push({
          index: i,
          data: jsonData[i],
          error: itemError.message
        });
      }
    }

    res.status(200).json({
      message: 'Import thành công!',
      summary: {
        collection,
        total: jsonData.length,
        success: importedCount.success,
        failed: importedCount.failed
      },
      errors: importedCount.failed > 0 ? errors : undefined
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  importJson,
  importJsonByUrl
};
