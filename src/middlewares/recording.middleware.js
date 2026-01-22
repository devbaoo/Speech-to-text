const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const uploadAudio = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
     if (file.mimetype.startsWith("audio/")) {
       cb(null, true);
     } else {
       cb(new Error("Only audio files are allowed!"), false);
     }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
});

module.exports = uploadAudio;
