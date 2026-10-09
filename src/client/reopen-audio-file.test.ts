import { describe, it, expect, vi } from "vitest";
import { openAudioFile, resolveDisplayAudioInit } from "./reopen-audio-file";

const okResult = (sc: Record<string, unknown>) => ({
    content: [{ type: "text", text: String(sc.path) }],
    structuredContent: sc,
});

describe("openAudioFile", () => {
    it("returns the result on success", async () => {
        const result = okResult({ path: "/a.wav", sizeBytes: 10 });
        const call = vi.fn(async () => result);
        await expect(openAudioFile(call, { path: "/a.wav" })).resolves.toBe(result);
        expect(call).toHaveBeenCalledWith({ path: "/a.wav" });
    });

    it("throws the tool's error text", async () => {
        const call = vi.fn(async () => ({
            isError: true,
            content: [{ type: "text", text: "Not a recognised audio file" }],
        }));
        await expect(openAudioFile(call, { path: "/etc/passwd" })).rejects.toThrow(
            "Not a recognised audio file",
        );
    });

    it("throws a generic message when the error has no text", async () => {
        const call = vi.fn(async () => ({ isError: true }));
        await expect(openAudioFile(call, { path: "/a.wav" })).rejects.toThrow(
            "could not open audio file",
        );
    });
});

describe("resolveDisplayAudioInit", () => {
    it("uses the init as-is when it has a size", async () => {
        const call = vi.fn();
        const init = { path: "/a.wav", sizeBytes: 10, playheadSeconds: 1 };
        await expect(resolveDisplayAudioInit(init, undefined, call)).resolves.toBe(
            init,
        );
        expect(call).not.toHaveBeenCalled();
    });

    it("re-opens a replayed path-only result", async () => {
        const call = vi.fn(async () =>
            okResult({ path: "/a.wav", sizeBytes: 1234, mtimeMs: 1 }),
        );
        const resolved = await resolveDisplayAudioInit(
            { path: "/a.wav" },
            undefined,
            call,
        );
        expect(call).toHaveBeenCalledWith({ path: "/a.wav" });
        expect(resolved).toEqual({ path: "/a.wav", sizeBytes: 1234 });
    });

    it("passes the original tool arguments through, keeping the result's path", async () => {
        const call = vi.fn(async (args: Record<string, unknown>) =>
            okResult({
                path: "/a.wav",
                sizeBytes: 5,
                playheadSeconds: args.playheadSeconds,
                region: args.region,
            }),
        );
        const resolved = await resolveDisplayAudioInit(
            { path: "/a.wav" },
            {
                path: "  '/a.wav'  ",
                playheadSeconds: 3,
                region: { startSeconds: 1, endSeconds: 2 },
            },
            call,
        );
        expect(call).toHaveBeenCalledWith({
            path: "/a.wav",
            playheadSeconds: 3,
            region: { startSeconds: 1, endSeconds: 2 },
        });
        expect(resolved).toEqual({
            path: "/a.wav",
            sizeBytes: 5,
            playheadSeconds: 3,
            region: { startSeconds: 1, endSeconds: 2 },
        });
    });

    it("surfaces the server's refusal", async () => {
        const call = vi.fn(async () => ({
            isError: true,
            content: [{ type: "text", text: "Not a recognised audio file" }],
        }));
        await expect(
            resolveDisplayAudioInit({ path: "/etc/passwd" }, undefined, call),
        ).rejects.toThrow("Not a recognised audio file");
    });

    it("throws when the fresh result still lacks a size", async () => {
        const call = vi.fn(async () => ({
            content: [{ type: "text", text: "/a.wav" }],
        }));
        await expect(
            resolveDisplayAudioInit({ path: "/a.wav" }, undefined, call),
        ).rejects.toThrow("missing file size from server");
    });
});
