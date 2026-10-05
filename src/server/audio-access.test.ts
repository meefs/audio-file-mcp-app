import { describe, it, expect, vi } from "vitest";
import {
    createAudioAccess,
    NOT_AUDIO,
    NOT_REGISTERED,
    type AccessDeps,
} from "./audio-access.js";

type FakeFile = { kind: "file" | "dir"; audio?: boolean };

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
            return { isFile: () => f.kind === "file", size: 10, mtimeMs: 1 };
        }),
        sniff: vi.fn(async (p: string) =>
            files[resolve(p)]?.audio ? { format: "wav" } : null,
        ),
    } satisfies AccessDeps;
    return { deps, links };
}

describe("createAudioAccess", () => {
    it("admits audio and authorizes the same path and a symlink to it", async () => {
        const { deps } = fakeDeps(
            { "/a/song.wav": { kind: "file", audio: true } },
            { "/link.wav": "/a/song.wav" },
        );
        const access = createAudioAccess(deps);
        const stat = await access.admit("/a/song.wav");
        expect(stat.size).toBe(10);
        expect(await access.authorize("/a/song.wav")).toBe("/a/song.wav");
        expect(await access.authorize("/link.wav")).toBe("/a/song.wav");
    });

    it("admitting through a symlink registers the target", async () => {
        const { deps } = fakeDeps(
            { "/a/song.wav": { kind: "file", audio: true } },
            { "/link.wav": "/a/song.wav" },
        );
        const access = createAudioAccess(deps);
        await access.admit("/link.wav");
        expect(await access.authorize("/a/song.wav")).toBe("/a/song.wav");
    });

    it("rejects non-audio with NOT_AUDIO and registers nothing", async () => {
        const { deps } = fakeDeps({ "/etc/passwd": { kind: "file" } });
        const access = createAudioAccess(deps);
        await expect(access.admit("/etc/passwd")).rejects.toThrow(NOT_AUDIO);
        await expect(access.authorize("/etc/passwd")).rejects.toThrow(
            NOT_REGISTERED,
        );
    });

    it("rejects a directory without sniffing and registers nothing", async () => {
        const { deps } = fakeDeps({ "/a": { kind: "dir" } });
        const access = createAudioAccess(deps);
        await expect(access.admit("/a")).rejects.toThrow("Not a file");
        expect(deps.sniff).not.toHaveBeenCalled();
        await expect(access.authorize("/a")).rejects.toThrow(NOT_REGISTERED);
    });

    it("propagates stat errors from admit", async () => {
        const { deps } = fakeDeps({});
        const access = createAudioAccess(deps);
        await expect(access.admit("/missing.wav")).rejects.toThrow("ENOENT");
    });

    it("refuses a never-admitted path without sniffing", async () => {
        const { deps } = fakeDeps({ "/b.wav": { kind: "file", audio: true } });
        const access = createAudioAccess(deps);
        await expect(access.authorize("/b.wav")).rejects.toThrow(NOT_REGISTERED);
        expect(deps.sniff).not.toHaveBeenCalled();
    });

    it("refuses a nonexistent path with NOT_REGISTERED, not ENOENT", async () => {
        const { deps } = fakeDeps({});
        const access = createAudioAccess(deps);
        const err = await access.authorize("/nope").catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain(NOT_REGISTERED);
        expect((err as Error).message).not.toContain("ENOENT");
    });

    it("refuses a symlink re-pointed at another file after admission", async () => {
        const { deps, links } = fakeDeps(
            {
                "/a/song.wav": { kind: "file", audio: true },
                "/home/secret": { kind: "file" },
            },
            { "/link.wav": "/a/song.wav" },
        );
        const access = createAudioAccess(deps);
        await access.admit("/link.wav");
        links["/link.wav"] = "/home/secret";
        await expect(access.authorize("/link.wav")).rejects.toThrow(
            NOT_REGISTERED,
        );
    });
});
