/**
 * Audio utilities for Buddy: Lock In
 *
 * Handles playback of server-served MP3 URLs (pre-generated via ElevenLabs).
 * Includes a simple queue to prevent overlapping pet voice lines.
 */

let activeAudio = null;
const queue = [];
let isPlaying = false;

function playNext() {
  if (isPlaying || queue.length === 0) return;
  const { url, onEnd } = queue.shift();
  isPlaying = true;

  const audio = new Audio(url);
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
 * Queue an audio URL for sequential playback.
 * @param {string} url - URL of the MP3 file (e.g. /audio/reactions/cat/focus-lost-2.mp3)
 * @param {{ priority?: boolean, onEnd?: () => void }} options
 */
export function playAudio(url, { priority = false, onEnd } = {}) {
  if (!url) return;
  if (priority) {
    stopAudio();
    queue.unshift({ url, onEnd });
  } else {
    queue.push({ url, onEnd });
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
export function playQuestionAudio(url) {
  playAudio(url, { priority: true });
}
