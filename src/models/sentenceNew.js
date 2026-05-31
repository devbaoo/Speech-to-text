const mongoose = require('mongoose');

const sentenceSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true
    },
    status: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 1 // 0=user created, 1=admin created, 2=has approved recording, 3=rejected
    }
    ,
    createdBy: {
      type: String,
      default: null
    },
    plainText: {
      type: String,
      default: null
    },
    audioPlaintext: {
      type: String,
      default: null
    },
    audioContent: {
      type: String,
      default: null
    },
    recordingsCount: {
      type: Number,
      default: 0
    }
  },
  {
    collection: 'sentence_new',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

// Add indexes for performance
sentenceSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('sentence_new', sentenceSchema);
