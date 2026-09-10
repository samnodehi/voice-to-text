/**
 * Chrome shipped Web Speech API members that @types/dom-speech-recognition@0.0.12 does not
 * describe yet. Verified present on SpeechRecognition.prototype in Chrome 152 (see
 * docs/research-notes.md §9); declared here rather than cast away at each use site.
 */
interface SpeechRecognition {
  /**
   * Ask the engine to infer punctuation from natural pauses and prosody, so the user does
   * not have to say "period". Experimental and language-dependent — always feature-detect.
   */
  unspokenPunctuation: boolean;
}
