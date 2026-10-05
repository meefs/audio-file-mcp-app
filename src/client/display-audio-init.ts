import { parseAnnotationData, type AnnotationData } from "../shared/annotation-data";

export type DisplayAudioInit = {
    path: string;
    sizeBytes?: number;
    playheadSeconds?: number;
    region?: { startSeconds: number; endSeconds: number };
    annotations?: AnnotationData;
};

type ToolResultLike = {
    content?: ReadonlyArray<{ type?: string; text?: string }> | undefined;
    structuredContent?: Record<string, unknown> | undefined;
};

// Claude Desktop restores a saved tool result with structuredContent dropped and
// its JSON serialized into the text content instead, so recover it from there.
export function structuredContentOf(
    result: ToolResultLike,
): Record<string, unknown> | undefined {
    if (result.structuredContent) return result.structuredContent;
    const text = firstText(result);
    if (!text || !text.trimStart().startsWith("{")) return undefined;
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Not JSON; the text is a plain path.
    }
    return undefined;
}

export function parseDisplayAudioInit(
    result: ToolResultLike,
): DisplayAudioInit | null {
    const sc = structuredContentOf(result);
    const path = pickPath(sc, result);
    if (!path) return null;

    const init: DisplayAudioInit = { path };
    if (!sc || typeof sc !== "object") return init;

    const sz = sc.sizeBytes;
    if (
        typeof sz === "number" &&
        Number.isFinite(sz) &&
        sz >= 0 &&
        Number.isInteger(sz)
    ) {
        init.sizeBytes = sz;
    }

    const ph = sc.playheadSeconds;
    if (typeof ph === "number" && Number.isFinite(ph) && ph >= 0) {
        init.playheadSeconds = ph;
    }

    const region = sc.region;
    if (region && typeof region === "object") {
        const r = region as Record<string, unknown>;
        const a = r.startSeconds;
        const b = r.endSeconds;
        if (
            typeof a === "number" &&
            typeof b === "number" &&
            Number.isFinite(a) &&
            Number.isFinite(b) &&
            a >= 0 &&
            b > a
        ) {
            init.region = { startSeconds: a, endSeconds: b };
        }
    }

    const annotations = parseAnnotationData(sc.annotations);
    if (annotations) {
        init.annotations = annotations;
    }

    return init;
}

function pickPath(
    sc: Record<string, unknown> | undefined,
    result: ToolResultLike,
): string | null {
    if (sc && typeof sc.path === "string" && sc.path.length > 0) {
        return sc.path;
    }
    // The text was the JSON itself, not a path.
    if (sc && !result.structuredContent) return null;
    const text = firstText(result);
    return text && text.length > 0 ? text : null;
}

function firstText(result: ToolResultLike): string | undefined {
    return result.content?.find((c) => c?.type === "text")?.text;
}
