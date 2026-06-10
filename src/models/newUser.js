const mongoose = require('mongoose');

const newUserSchema = new mongoose.Schema(
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
    collection: 'new_user',
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: false
    }
  }
);

newUserSchema.index({ domainCode: 1, topic: 1, sentenceOrder: 1 });

module.exports = mongoose.model('new_user', newUserSchema);
