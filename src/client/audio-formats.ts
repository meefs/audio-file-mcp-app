import type { AudioFormat } from "../shared/sniff-audio-bytes";

export { sniffAudioFormatBytes, type AudioFormat } from "../shared/sniff-audio-bytes";

// Containers/codecs mediabunny can decode. Other formats are still sniffed so
// the `unsupported` banner can name them; they just don't decode.
const MEDIABUNNY_SUPPORTED: ReadonlySet<AudioFormat> = new Set<AudioFormat>([
    "wav",
    "mp3",
    "aac",
    "m4a",
    "flac",
    "opus",
    "oga",
    "webm",
]);

export function isMediabunnySupported(format: AudioFormat | null): boolean {
    return format !== null && MEDIABUNNY_SUPPORTED.has(format);
}
