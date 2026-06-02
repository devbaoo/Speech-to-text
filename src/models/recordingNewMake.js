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

    // Audio cho bản PlainText (csTranscript)
    audioPlaintext: {
      type: String,
      default: null,
    },

    durationPlaintext: {
      type: Number,
      default: null,
    },

    // Audio cho bản Content (viEquivalent)
    audioContent: {
      type: String,
      default: null,
    },

    durationContent: {
      type: Number,
      default: null,
    },

    // Trạng thái duyệt: 0=chờ duyệt, 1=được duyệt, 2=bị từ chối
    isApproved: {
      type: Number,
      enum: [0, 1, 2],
      default: 0,
    },

    // Thời gian ghi âm
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
recordingNewMakeSchema.index({ createdAt: -1 });
recordingNewMakeSchema.index({ personId: 1 });
recordingNewMakeSchema.index({ sentenceId: 1 });

module.exports = mongoose.model("recording_new_make", recordingNewMakeSchema);
