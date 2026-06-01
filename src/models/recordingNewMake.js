const mongoose = require("mongoose");

const recordingNewMakeSchema = new mongoose.Schema(
  {
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },

    sentenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "sentence_new_make",
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
      type: Number, // duration in seconds
      default: null,
    },

    recordedAt: {
      type: Date,
      default: Date.now,
    },

    // Trạng thái đã lưu vào Sentence (tránh lưu trùng)
    savedToSentence: {
      type: Boolean,
      default: false
    }
  },
  {
    collection: "recording_new_make",
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt'
    }
  }
);

// Add indexes for performance
recordingNewMakeSchema.index({ isApproved: 1, createdAt: -1 });
recordingNewMakeSchema.index({ personId: 1 });
recordingNewMakeSchema.index({ sentenceId: 1 });

module.exports = mongoose.model("recording_new_make", recordingNewMakeSchema);
