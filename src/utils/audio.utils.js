/**
 * Audio utilities
 */
const mm = require("music-metadata");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const path = require("path");
const fs = require("fs");
const os = require("os");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Parse WAV duration from buffer using WAV header (most reliable for browser audio).
 * Returns null if not a valid WAV or parsing fails.
 * @param {Buffer} buffer
 * @returns {number|null} Duration in seconds
 */
function getWavDuration(buffer) {
  try {
    if (buffer.length < 44) {
      return null;
    }

    const riff = buffer.toString("ascii", 0, 4);
    const wave = buffer.toString("ascii", 8, 12);
    if (riff !== "RIFF" || wave !== "WAVE") return null;

    const numChannels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    if (!sampleRate || !numChannels || !bitsPerSample) {
      return null;
    }

    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;

    let dataSize = 0;
    let offset = 36;
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString("ascii", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
      if (chunkSize % 2 !== 0) offset++; // WAVE chunks are word-aligned
    }

    if (dataSize === 0) return null;

    const duration = dataSize / (sampleRate * blockAlign);
    return Math.round(duration * 100) / 100;
  } catch (e) {
    return null;
  }
}

/**
 * Get audio duration using FFmpeg (most reliable fallback, works with any format).
 * Writes buffer to a temp file to avoid FFmpeg stdin limitations.
 * Returns null if FFmpeg fails or is unavailable.
 * @param {Buffer} buffer
 * @returns {Promise<number|null>} Duration in seconds
 */
async function getAudioDurationFromFFmpeg(buffer) {
  return new Promise((resolve) => {
    const tmpPath = path.join(os.tmpdir(), `audio_dur_${Date.now()}.tmp`);
    try {
      fs.writeFile(tmpPath, buffer, (writeErr) => {
        if (writeErr) {
          return resolve(null);
        }

        ffmpeg.ffprobe(tmpPath, (err, metadata) => {
          fs.unlink(tmpPath, () => {});

          if (err) {
            return resolve(null);
          }

          const dur = metadata?.format?.duration;
          if (dur == null || isNaN(dur)) {
            return resolve(null);
          }

          resolve(Math.round(dur * 100) / 100);
        });
      });
    } catch (e) {
      try { fs.unlink(tmpPath, () => {}); } catch (_) {}
      resolve(null);
    }
  });
}

/**
 * Generic audio duration from buffer (tries WAV header first, then music-metadata, then FFmpeg).
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<number|null>}
 */
async function getAudioDuration(buffer, mimeType) {
  // 1. WAV header parsing works for all browser-recorded valid WAV files
  const wavDuration = getWavDuration(buffer);
  if (wavDuration !== null) {
    return wavDuration;
  }

  // 2. Fallback to music-metadata (mp3, ogg, webm, m4a, opus, etc.)
  try {
    const metadata = await mm.parseBuffer(buffer, mimeType || undefined);
    const mmDur = metadata.format.duration;
    if (mmDur != null && !isNaN(mmDur)) {
      return Math.round(mmDur * 100) / 100;
    }
  } catch (err) {
    // music-metadata failed, fall through to FFmpeg
  }

  // 3. Final fallback: FFmpeg (handles anything — corrupted headers, unusual codecs, etc.)
  return await getAudioDurationFromFFmpeg(buffer);
}

module.exports = { getAudioDuration };
