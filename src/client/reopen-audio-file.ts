import {
    parseDisplayAudioInit,
    type DisplayAudioInit,
} from "./display-audio-init";

export type ToolResult = {
    content?: ReadonlyArray<{ type?: string; text?: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
};

// Calls display_audio_file from the app.
export type CallDisplayAudioFile = (
    args: Record<string, unknown>,
) => Promise<ToolResult>;

export type ResolvedDisplayAudioInit = DisplayAudioInit & { sizeBytes: number };

// Calls display_audio_file and throws with the tool's own error text if it fails.
export async function openAudioFile(
    call: CallDisplayAudioFile,
    args: Record<string, unknown>,
): Promise<ToolResult> {
    const result = await call(args);
    if (result.isError) {
        const text = result.content
            ?.map((c) => (c.type === "text" ? (c.text ?? "") : ""))
            .join(" ")
            .trim();
        throw new Error(text || "could not open audio file");
    }
    return result;
}

// A host restoring a saved conversation may drop structuredContent and leave
// only the path from the text content (Claude Desktop instead serializes it
// into the text; see structuredContentOf). In that case open the file again to
// get its size. The original tool arguments, when the host replays them, carry
// the playhead, region and annotations over.
export async function resolveDisplayAudioInit(
    init: DisplayAudioInit,
    toolInput: Record<string, unknown> | undefined,
    call: CallDisplayAudioFile,
): Promise<ResolvedDisplayAudioInit> {
    if (init.sizeBytes !== undefined) {
        return init as ResolvedDisplayAudioInit;
    }
    const result = await openAudioFile(call, { ...toolInput, path: init.path });
    const fresh = parseDisplayAudioInit(result);
    if (!fresh || fresh.sizeBytes === undefined) {
        throw new Error("missing file size from server");
    }
    return fresh as ResolvedDisplayAudioInit;
}
