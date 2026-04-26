const mongoose = require('mongoose');

const SegmentSchema = new mongoose.Schema({
  start: { type: Number, required: true },
  end: { type: Number, required: true },
  text: { type: String, required: true }
}, { _id: false });

const TranscriptSchema = new mongoose.Schema({
  videoId: { type: String, required: true, index: true },
  segments: [SegmentSchema],
  fullText: { type: String },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transcript', TranscriptSchema);
