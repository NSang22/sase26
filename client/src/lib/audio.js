/**
 * Audio utilities for Buddy: Lock In
 *
 * Handles playback of base64-encoded MP3 clips returned by the server
 * (pre-generated via ElevenLabs). Includes a simple queue to prevent
 * overlapping pet voice lines.
 */

let activeAudio = null;
const queue = [];
let isPlaying = false;

function playNext() {
  if (isPlaying || queue.length === 0) return;
  const { base64, onEnd } = queue.shift();
  isPlaying = true;

  const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
  activeAudio = audio;

  audio.onended = () => {
    isPlaying = false;
    activeAudio = null;
    onEnd?.();
    playNext();
  };

  audio.onerror = () => {
    isPlaying = false;
    activeAudio = null;
    playNext();
  };

  audio.play().catch(() => {
    isPlaying = false;
    activeAudio = null;
    playNext();
  });
}

/**
 * Queue a base64 audio clip for sequential playback.
 * @param {string} base64 - MP3 data as base64 string
 * @param {{ priority?: boolean, onEnd?: () => void }} options
 */
export function playAudio(base64, { priority = false, onEnd } = {}) {
  if (!base64) return;
  if (priority) {
    stopAudio();
    queue.unshift({ base64, onEnd });
  } else {
    queue.push({ base64, onEnd });
  }
  playNext();
}

/**
 * Stop current playback and flush the queue.
 */
export function stopAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  queue.length = 0;
  isPlaying = false;
}

/**
 * Play a quiz question audio clip (priority — interrupts pet chatter).
 */
export function playQuestionAudio(base64) {
  playAudio(base64, { priority: true });
}
