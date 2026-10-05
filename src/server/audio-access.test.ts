import { describe, it, expect, vi } from "vitest";
import {
    createAudioAccess,
    NOT_AUDIO,
    type AccessDeps,
} from "./audio-access.js";

type FakeFile = {
    kind: "file" | "dir";
    audio?: boolean;
    size?: number;
    mtimeMs?: number;
};

// `links` maps a path to its realpath; `files` is keyed by realpath.
function fakeDeps(
    files: Record<string, FakeFile>,
    links: Record<string, string> = {},
) {
    const resolve = (p: string) => links[p] ?? p;
    const deps = {
        realpath: vi.fn(async (p: string) => {
            const real = resolve(p);
            if (!(real in files)) throw new Error(`ENOENT: ${p}`);
            return real;
        }),
        stat: vi.fn(async (p: string) => {
            const f = files[resolve(p)];
            if (!f) throw new Error(`ENOENT: ${p}`);
            return {
                isFile: () => f.kind === "file",
                size: f.size ?? 10,
                mtimeMs: f.mtimeMs ?? 1,
            };
        }),
        sniff: vi.fn(async (p: string) =>
            files[resolve(p)]?.audio ? { format: "wav" } : null,
        ),
    } satisfies AccessDeps;
    return { deps, files, links };
}

describe("createAudioAccess.admit", () => {
    it("returns the stat of an audio file", async () => {
        const { deps } = fakeDeps({ "/a.wav": { kind: "file", audio: true } });
        const stat = await createAudioAccess(deps).admit("/a.wav");
        expect(stat.size).toBe(10);
    });

    it("rejects non-audio with NOT_AUDIO", async () => {
        const { deps } = fakeDeps({ "/etc/passwd": { kind: "file" } });
        await expect(createAudioAccess(deps).admit("/etc/passwd")).rejects.toThrow(
            NOT_AUDIO,
        );
    });

    it("rejects a directory without sniffing", async () => {
        const { deps } = fakeDeps({ "/a": { kind: "dir" } });
        await expect(createAudioAccess(deps).admit("/a")).rejects.toThrow(
            "Not a file",
        );
        expect(deps.sniff).not.toHaveBeenCalled();
    });

    it("propagates stat errors", async () => {
        const { deps } = fakeDeps({});
        await expect(createAudioAccess(deps).admit("/missing.wav")).rejects.toThrow(
            "ENOENT",
        );
    });
});

describe("createAudioAccess.authorize", () => {
    it("serves an audio file without a prior admit, returning its realpath", async () => {
        const { deps } = fakeDeps(
            { "/a/song.wav": { kind: "file", audio: true } },
            { "/link.wav": "/a/song.wav" },
        );
        const access = createAudioAccess(deps);
        expect(await access.authorize("/a/song.wav")).toBe("/a/song.wav");
        expect(await access.authorize("/link.wav")).toBe("/a/song.wav");
    });

    it("refuses non-audio, directories and missing paths with the same error", async () => {
        const { deps } = fakeDeps({
            "/etc/passwd": { kind: "file" },
            "/a": { kind: "dir" },
        });
        const access = createAudioAccess(deps);
        for (const p of ["/etc/passwd", "/a", "/nope"]) {
            const err = await access.authorize(p).catch((e: Error) => e);
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toBe(NOT_AUDIO);
        }
    });

    it("sniffs once per file version across admit and repeated reads", async () => {
        const { deps } = fakeDeps({ "/a.wav": { kind: "file", audio: true } });
        const access = createAudioAccess(deps);
        await access.admit("/a.wav");
        await access.authorize("/a.wav");
        await access.authorize("/a.wav");
        expect(deps.sniff).toHaveBeenCalledTimes(1);
    });

    it("re-checks a file whose size or mtime changed", async () => {
        const { deps, files } = fakeDeps({
            "/a.wav": { kind: "file", audio: true },
        });
        const access = createAudioAccess(deps);
        await access.authorize("/a.wav");
        files["/a.wav"] = { kind: "file", audio: false, mtimeMs: 2 };
        await expect(access.authorize("/a.wav")).rejects.toThrow(NOT_AUDIO);
        expect(deps.sniff).toHaveBeenCalledTimes(2);
    });

    it("refuses a symlink re-pointed from audio to a non-audio file", async () => {
        const { deps, links } = fakeDeps(
            {
                "/a/song.wav": { kind: "file", audio: true },
                "/home/secret": { kind: "file" },
            },
            { "/link.wav": "/a/song.wav" },
        );
        const access = createAudioAccess(deps);
        await access.authorize("/link.wav");
        links["/link.wav"] = "/home/secret";
        await expect(access.authorize("/link.wav")).rejects.toThrow(NOT_AUDIO);
    });

    it("keeps the cache bounded", async () => {
        const files: Record<string, FakeFile> = {};
        for (let i = 0; i < 70; i++) files[`/${i}.wav`] = { kind: "file", audio: true };
        const { deps } = fakeDeps(files);
        const access = createAudioAccess(deps);
        for (let i = 0; i < 70; i++) await access.authorize(`/${i}.wav`);
        deps.sniff.mockClear();
        await access.authorize("/69.wav"); // recent: cached
        expect(deps.sniff).not.toHaveBeenCalled();
        await access.authorize("/0.wav"); // oldest: evicted
        expect(deps.sniff).toHaveBeenCalledTimes(1);
    });
});
