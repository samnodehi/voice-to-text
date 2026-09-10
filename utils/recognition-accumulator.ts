/**
 * Turns the Web Speech API's cumulative result list into a monotonic stream of
 * "newly committed text" + "current tail".
 *
 * Two properties matter here, and both were real defects before this existed:
 *
 * 1. **No duplication.** `event.results` is cumulative and the engine may revise and
 *    re-report earlier entries, so `event.resultIndex` can move backwards. Committing
 *    whatever the event points at duplicated text. We track our own counter, which only
 *    ever moves forward.
 * 2. **No loss.** A `continuous` session that ends (silence timeout, or the user stopping)
 *    throws away its un-finalized tail, and the restarted session starts from an empty
 *    list. `takePendingFinal()` lets the caller commit that tail before it disappears.
 */

/**
 * The slice of SpeechRecognitionResult we actually read. Declared structurally (index
 * signature, not a literal `0`) so the real DOM `SpeechRecognitionResultList` is assignable.
 */
export interface ResultLike {
  readonly isFinal: boolean;
  readonly [alternative: number]: { readonly transcript: string };
}

export interface RecognitionChunk {
  /** Newly finalized and normalized text, trailing space included. '' if none this event. */
  finalText: string;
  /** The still-revising tail, raw. '' once it has been finalized. */
  interimText: string;
}

export interface RecognitionAccumulator {
  consume(results: ArrayLike<ResultLike>): RecognitionChunk;
  /**
   * Hand back the un-finalized tail as committed text, exactly once. Returns '' when the
   * engine already finalized it, so this can be called on every session end without risk
   * of committing the same words twice.
   */
  takePendingFinal(): string;
  /** A restarted session numbers its results from zero again. */
  resetSessionIndex(): void;
  /** Characters currently held un-finalized. 0 means the engine has nothing in flight. */
  pendingLength(): number;
}

export function createRecognitionAccumulator(
  normalizeFinal: (raw: string) => string,
): RecognitionAccumulator {
  let finalizedCount = 0;
  let pendingInterim = '';

  return {
    consume(results) {
      let finalText = '';
      let interimText = '';
      for (let i = finalizedCount; i < results.length; i++) {
        const result = results[i];
        if (result === undefined) continue;
        // A final with no readable alternative must still advance the counter, or we would
        // re-walk it on every event forever. Missing text is treated as empty, not skipped.
        const raw = result[0]?.transcript ?? '';
        if (result.isFinal) {
          // Chrome emits blank finals during long sessions. Appending ' ' for each one typed
          // a lone space into the user's field per sentence — reported in the wild.
          const clean = normalizeFinal(raw);
          if (clean.trim()) finalText += clean + ' ';
          finalizedCount = i + 1;
        } else {
          interimText += raw;
        }
      }
      pendingInterim = interimText;
      return { finalText, interimText };
    },

    takePendingFinal() {
      const tail = pendingInterim;
      pendingInterim = '';
      return tail.trim() ? normalizeFinal(tail) + ' ' : '';
    },

    resetSessionIndex() {
      finalizedCount = 0;
    },

    pendingLength() {
      return pendingInterim.length;
    },
  };
}
