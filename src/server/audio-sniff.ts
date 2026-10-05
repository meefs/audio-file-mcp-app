import fs from "node:fs/promises";
import {
    Input,
    StreamSource,
    WAVE,
    MP3,
    MP4,
    QTFF,
    MATROSKA,
    WEBM,
    OGG,
    FLAC,
    ADTS,
    MPEG_TS,
} from "mediabunny";
import { sniffAudioFormatBytes } from "../shared/sniff-audio-bytes.js";

const HEAD_BYTES = 64;
// Explicit list: ALL_FORMATS includes HLS, which accepts any `#EXTM3U` text file.
const MEDIABUNNY_FORMATS = [
    WAVE,
    MP3,
    MP4,
    QTFF,
    MATROSKA,
    WEBM,
    OGG,
    FLAC,
    ADTS,
    MPEG_TS,
];

export type AudioSniffResult = {
    via: "audio-type" | "mediabunny";
    format: string;
};

// Answers "is this file recognised audio?" with the same coverage the app has:
// audio-type covers formats we only show metadata for (AIFF, CAF, AMR, ...);
// mediabunny covers files it plays that audio-type misses (RF64/RIFX, MP3 with
// leading junk, MPEG-TS). Rejects if the file can't be opened.
export async function sniffAudioFile(
    path: string,
): Promise<AudioSniffResult | null> {
    const fh = await fs.open(path, "r");
    try {
        const head = await readRange(fh, 0, HEAD_BYTES);
        const format = sniffAudioFormatBytes(head);
        if (format) return { via: "audio-type", format };
        if (head.length === 0) return null;
        return await probeWithMediabunny(fh);
    } finally {
        await fh.close();
    }
}

async function probeWithMediabunny(
    fh: fs.FileHandle,
): Promise<AudioSniffResult | null> {
    // A StreamSource over our own handle, rather than FilePathSource, so the
    // file is closed deterministically by the caller. We can then skip
    // Input#dispose() on failure: in mediabunny 1.45 it chains `.then()` on the
    // rejected detection promise with no catch, leaking an unhandled rejection.
    const input = new Input({
        source: new StreamSource({
            getSize: async () => (await fh.stat()).size,
            read: (start, end) => readRange(fh, start, end - start),
        }),
        formats: MEDIABUNNY_FORMATS,
    });
    let detected;
    try {
        detected = await input.getFormat();
    } catch {
        return null;
    }
    input.dispose();
    return { via: "mediabunny", format: detected.name };
}

async function readRange(
    fh: fs.FileHandle,
    position: number,
    length: number,
): Promise<Uint8Array> {
    const buf = new Uint8Array(length);
    const { bytesRead } = await fh.read(buf, 0, length, position);
    return buf.subarray(0, bytesRead);
}
