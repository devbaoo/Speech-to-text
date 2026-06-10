const mongoose = require('mongoose');

const newSentenceSchema = new mongoose.Schema(
  {
    domainCode: {
      type: String,
      required: true,
      trim: true
    },
    topic: {
      type: String,
      required: true,
      trim: true
    },
    sentenceOrder: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: Number,
      default: 1
    },
    createdBy: {
      type: String,
      default: null
    }
  },
  {
    collection: 'new_sentence',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

newSentenceSchema.index({ domainCode: 1, topic: 1, sentenceOrder: 1 });

module.exports = mongoose.model('new_sentence', newSentenceSchema);
