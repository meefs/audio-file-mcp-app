import audioType, { type AudioFormat } from "audio-type";

export type { AudioFormat };

// audio-type reads `buf.buffer` from offset 0, ignoring the view's byteOffset,
// so always hand it a fresh, zero-offset copy.
export function sniffAudioFormatBytes(bytes: Uint8Array): AudioFormat | null {
    return audioType(Uint8Array.from(bytes)) ?? null;
}
