const mongoose = require('mongoose');

const sentenceNewMakeSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      unique: true
    },
    domain: {
      type: String,
      default: null
    },
    csTranscript: {
      type: String,
      required: true
    },
    viEquivalent: {
      type: String,
      required: true
    },
    alignment: [
      {
        source: String,
        sourceLang: String,
        target: String,
        targetLang: String,
        relation: String
      }
    ],
    status: {
      type: Number,
      default: 1  // 1 = approved/imported
    },
    createdBy: {
      type: String,
      default: null
    }
  },
  {
    collection: 'sentence_new_make',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

// Index for performance
sentenceNewMakeSchema.index({ externalId: 1 });
sentenceNewMakeSchema.index({ domain: 1 });
sentenceNewMakeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('sentence_new_make', sentenceNewMakeSchema);
