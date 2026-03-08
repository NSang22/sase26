/**
 * Audio utilities for Buddy: Lock In
 *
 * Two audio layers:
 * 1. Narrator (ElevenLabs TTS) — quiz questions, recaps, alerts. Queued sequentially.
 * 2. Pokémon SFX — short sound-effect clips from /audio/pokemon/. Can overlap with narrator.
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
 * Queue a narrator audio URL for sequential playback.
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
 * Stop current narrator playback and flush the queue.
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
 * Play a quiz question audio clip (priority — interrupts current narrator audio).
 */
export function playQuestionAudio(url) {
  playAudio(url, { priority: true });
}

/**
 * Play a Pokémon SFX clip. Fires independently of the narrator queue (can overlap).
 * @param {string} pokemonType - e.g. 'pikachu', 'eevee', 'bulbasaur', 'squirtle', 'charmander'
 */
export function playPokemonSfx(pokemonType) {
  if (!pokemonType) return;
  const url = `/audio/pokemon/${pokemonType}.mp3`;
  const sfx = new Audio(url);
  sfx.volume = 0.5;
  sfx.play().catch(() => {});
}
