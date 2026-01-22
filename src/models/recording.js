const mongoose = require("mongoose");

const recordingSchema = new mongoose.Schema(
  {
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "person",
      required: true,
    },

    sentenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "sentence",
      required: true,
    },

    audioUrl: {
      type: String,
      required: true,
    },

    isApproved: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0, // 0 = chờ duyệt, 1 = được duyệt, 2 = bị từ chối, 3 = không thể duyệt
    },

    duration: {
      type: Number, // duration in seconds (or as returned by cloudinary)
      default: null,
    },

    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "recording",
    timestamps: false,
  }
);

module.exports = mongoose.model("recording", recordingSchema);
