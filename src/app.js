const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/users", require("./routes/person.route"));
app.use("/api", require("./routes/auth.route"));
app.use("/api/sentences", require("./routes/sentence.route"));
app.use("/api/recordings", require("./routes/recording.route"));

// Global error handler to return JSON (handles multer and other errors)
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server error" });
});

module.exports = app;
