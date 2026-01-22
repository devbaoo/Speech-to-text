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
    }
  },
  {
    collection: 'sentence',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

module.exports = mongoose.model('sentence', sentenceSchema);
