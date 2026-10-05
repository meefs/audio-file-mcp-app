import { describe, it, expect } from "vitest";
import { sniffAudioFormatBytes } from "./sniff-audio-bytes";

describe("sniffAudioFormatBytes", () => {
    it("sniffs a view's own bytes, not the start of its underlying buffer", () => {
        // Buffer starts like a FLAC file, but the view points at a WAV header.
        const backing = new Uint8Array(64);
        backing.set([0x66, 0x4c, 0x61, 0x43], 0); // "fLaC"
        const wav = [
            ...Buffer.from("RIFF"),
            0, 0, 0, 0,
            ...Buffer.from("WAVE"),
        ];
        backing.set(wav, 16);
        const view = backing.subarray(16, 48);

        expect(sniffAudioFormatBytes(view)).toBe("wav");
    });

    it("returns null for non-audio bytes", () => {
        expect(
            sniffAudioFormatBytes(new TextEncoder().encode("root:x:0:0:root")),
        ).toBeNull();
    });
});
