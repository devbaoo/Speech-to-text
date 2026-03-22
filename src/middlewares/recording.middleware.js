const multer = require("multer");

const storage = multer.memoryStorage();

const uploadAudio = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
     if (file.mimetype.startsWith("audio/") || file.mimetype.startsWith("video/")) {
       cb(null, true);
     } else {
       cb(new Error("Only audio/video files are allowed!"), false);
     }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

module.exports = uploadAudio;
