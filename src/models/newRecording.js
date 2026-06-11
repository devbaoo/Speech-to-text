const mongoose = require("mongoose");

const newRecordingSchema = new mongoose.Schema(
  {
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },

    sentenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "new_sentence",
      required: true,
    },

    audioUrl: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["plaintext", "content"],
      required: true
    },

    isApproved: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0, // 0 = chờ duyệt, 1 = được duyệt, 2 = bị từ chối, 3 = không thể duyệt
    },

    duration: {
      type: Number,
      default: null,
    },

    recordedAt: {
      type: Date,
      default: Date.now,
    },

    savedToSentence: {
      type: Boolean,
      default: false
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null
    }
  },
  {
    collection: "new_recording",
    timestamps: false,
  }
);

// Add indexes for performance
newRecordingSchema.index({ isApproved: 1, createdAt: -1 });
newRecordingSchema.index({ personId: 1 });
newRecordingSchema.index({ sentenceId: 1 });
newRecordingSchema.index({ email: 1 });

module.exports = mongoose.model("new_recording", newRecordingSchema);
