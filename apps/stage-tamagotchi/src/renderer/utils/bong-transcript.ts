/**
 * Conservative correction for the assistant's wake phrase in Vietnamese ASR.
 * The multilingual Zipformer sometimes recognizes "BÔNG ơi" as "BOK YI"
 * or unaccented spelling. Only adjust the beginning of a complete utterance;
 * never rewrite words elsewhere, and never infer BÔNG from "ông" or "ONG".
 */
const wakePhraseAtStart = /^(\s*)(?:b[oô]ng|bok)[\s,]+(?:ơi|oi|ôi|yi|i)(?=$|[\s,.!?;:])/iu

export function normalizeBongWakePhrase(text: string): string {
  return text.replace(wakePhraseAtStart, (_whole, prefix: string) => `${prefix}BÔNG ơi`)
}
