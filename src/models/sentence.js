const mongoose = require('mongoose');

const sentenceSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true
    },
    contentLower: {
      type: String,
      lowercase: true,
      sparse: true
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

// Add indexes for performance
sentenceSchema.index({ status: 1, createdAt: -1 });
sentenceSchema.index({ contentLower: 1, status: 1 });

module.exports = mongoose.model('sentence', sentenceSchema);
