import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NOT_AUDIO, NOT_REGISTERED } from "../shared/audio-access-errors.js";

const root = path.resolve(import.meta.dirname, "..", "..");
const wavFixture = path.join(
    root,
    "src/client/metadata/__fixtures__/wav-pcm16-stereo-44100.wav",
);

function rangeUri(p: string, start: number, length: number): string {
    return `audiofile-range://${encodeURIComponent(p)}/${start}/${length}`;
}

function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
    const content = result.content as { type: string; text?: string }[];
    return content.map((c) => c.text ?? "").join("\n");
}

describe("stdio server range resource gate", () => {
    let client: Client;
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "audio-e2e-"));
        client = new Client({ name: "e2e", version: "0.0.0" });
        await client.connect(
            new StdioClientTransport({
                command: path.join(root, "node_modules", ".bin", "tsx"),
                args: [path.join(root, "src/server/app.ts")],
                cwd: root,
                stderr: "ignore",
            }),
        );
    }, 30_000);

    afterAll(async () => {
        await client?.close();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it.skipIf(process.platform === "win32")(
        "refuses the reported PoC: reading /etc/passwd directly",
        async () => {
            await expect(
                client.readResource({ uri: rangeUri("/etc/passwd", 0, 4096) }),
            ).rejects.toThrow(NOT_REGISTERED);
        },
    );

    it("refuses an unregistered non-audio temp file", async () => {
        const p = path.join(tmpDir, "secret.txt");
        await fs.writeFile(p, "root:x:0:0:root:/root:/bin/bash\n");
        await expect(
            client.readResource({ uri: rangeUri(p, 0, 64) }),
        ).rejects.toThrow(NOT_REGISTERED);
    });

    it("rejects a non-audio file in display_audio_file and still refuses reads", async () => {
        const p = path.join(tmpDir, "passwd-copy");
        await fs.writeFile(p, "root:x:0:0:root:/root:/bin/bash\n");
        const result = await client.callTool({
            name: "display_audio_file",
            arguments: { path: p },
        });
        expect(result.isError).toBe(true);
        expect(toolText(result)).toContain(NOT_AUDIO);
        await expect(
            client.readResource({ uri: rangeUri(p, 0, 64) }),
        ).rejects.toThrow(NOT_REGISTERED);
    });

    it("serves bytes of an audio file opened through display_audio_file", async () => {
        const result = await client.callTool({
            name: "display_audio_file",
            arguments: { path: wavFixture },
        });
        expect(result.isError).toBeFalsy();
        const read = await client.readResource({
            uri: rangeUri(wavFixture, 0, 64),
        });
        const text = (read.contents[0] as { text: string }).text;
        const expected = (await fs.readFile(wavFixture)).subarray(0, 64);
        expect(Buffer.from(text, "base64").equals(expected)).toBe(true);
    });
});
