import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sniffAudioFile } from "./audio-sniff";

const FIXTURES = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../client/metadata/__fixtures__",
);
const fixtureNames = readdirSync(FIXTURES).filter(
    (n) => !n.endsWith(".ts") && !n.endsWith(".md"),
);

let tmp: string;
async function writeTemp(name: string, data: Uint8Array | string) {
    const p = path.join(tmp, name);
    await fs.writeFile(p, data);
    return p;
}

beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "audio-sniff-"));
});
afterAll(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

describe("sniffAudioFile", () => {
    it("has fixtures to check", () => {
        expect(fixtureNames.length).toBeGreaterThan(20);
    });

    it.each(fixtureNames)("accepts fixture %s", async (name) => {
        expect(await sniffAudioFile(path.join(FIXTURES, name))).not.toBeNull();
    });

    describe("rejects non-audio", () => {
        it("text file", async () => {
            const p = await writeTemp(
                "passwd.txt",
                "root:x:0:0:root:/root:/bin/bash\nnobody:x:65534:65534::/:/sbin/nologin\n",
            );
            expect(await sniffAudioFile(p)).toBeNull();
        });

        it("JSON file", async () => {
            const p = await writeTemp(
                "data.json",
                JSON.stringify({ name: "x", version: "1.0.0", deps: {} }),
            );
            expect(await sniffAudioFile(p)).toBeNull();
        });

        it("random bytes", async () => {
            // Deterministic pseudo-random bytes so a lucky sync word can't flake.
            const bytes = new Uint8Array(16384);
            let x = 0x12345678;
            for (let i = 0; i < bytes.length; i++) {
                x ^= x << 13;
                x ^= x >>> 17;
                x ^= x << 5;
                bytes[i] = x & 0x7f; // keep the top bit clear: no MP3/ADTS sync
            }
            const p = await writeTemp("random.bin", bytes);
            expect(await sniffAudioFile(p)).toBeNull();
        });

        it("empty file", async () => {
            const p = await writeTemp("empty", new Uint8Array(0));
            expect(await sniffAudioFile(p)).toBeNull();
        });

        it("HLS playlist (#EXTM3U)", async () => {
            const p = await writeTemp(
                "secret.m3u8",
                "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nseg0.ts\n",
            );
            expect(await sniffAudioFile(p)).toBeNull();
        });
    });

    describe("accepts mediabunny-only formats", () => {
        it("RF64 WAV", async () => {
            const wav = await fs.readFile(
                path.join(FIXTURES, "wav-pcm16-stereo-44100.wav"),
            );
            const rf64 = Buffer.from(wav);
            rf64.write("RF64", 0, "latin1");
            const p = await writeTemp("rf64.wav", rf64);
            expect(await sniffAudioFile(p)).toMatchObject({
                via: "mediabunny",
            });
        });

        it("MP3 with leading junk", async () => {
            const mp3 = await fs.readFile(
                path.join(FIXTURES, "mp3-cbr128-stereo-44100.mp3"),
            );
            const p = await writeTemp(
                "junk.mp3",
                Buffer.concat([Buffer.alloc(256), mp3]),
            );
            expect(await sniffAudioFile(p)).toMatchObject({
                via: "mediabunny",
            });
        });

        it("MPEG-TS", async () => {
            const ts = new Uint8Array(188 * 4);
            for (let i = 0; i < 4; i++) ts[i * 188] = 0x47;
            const p = await writeTemp("stream.ts", ts);
            expect(await sniffAudioFile(p)).toMatchObject({
                via: "mediabunny",
            });
        });
    });

    it("rejects for a nonexistent path", async () => {
        await expect(
            sniffAudioFile(path.join(tmp, "does-not-exist.wav")),
        ).rejects.toThrow();
    });
});
