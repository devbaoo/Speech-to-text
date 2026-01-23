const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Đảm bảo thư mục uploads luôn tồn tại và dùng đường dẫn tuyệt đối
const uploadDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
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
