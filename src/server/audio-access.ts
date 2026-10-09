import { NOT_AUDIO } from "../shared/audio-access-errors.js";

export { NOT_AUDIO };

export type AccessStat = { isFile(): boolean; size: number; mtimeMs: number };

export type AccessDeps = {
    realpath: (p: string) => Promise<string>;
    stat: (p: string) => Promise<AccessStat>;
    sniff: (p: string) => Promise<unknown | null>;
};

export type AudioAccess = ReturnType<typeof createAudioAccess>;

const CACHE_LIMIT = 64;

// Decides whether a file may be served: only regular files recognised as
// audio. Stateless on purpose: Claude Desktop restarts the server whenever a
// resource read fails, so per-process state (e.g. an allowlist of opened
// files) is lost exactly when the client would need it.
export function createAudioAccess(deps: AccessDeps) {
    // Positive results keyed by realpath + size + mtime, so a cached file that
    // is replaced or rewritten gets checked again. Insertion-ordered, oldest
    // evicted first.
    const known = new Set<string>();

    async function isAudio(real: string, stat: AccessStat): Promise<boolean> {
        const key = `${stat.size}:${stat.mtimeMs}:${real}`;
        if (known.has(key)) return true;
        if ((await deps.sniff(real)) == null) return false;
        known.add(key);
        if (known.size > CACHE_LIMIT) {
            known.delete(known.values().next().value!);
        }
        return true;
    }

    return {
        // For display_audio_file: errors are specific (ENOENT, not a file,
        // not audio) since the caller named the path.
        async admit(path: string): Promise<AccessStat> {
            const stat = await deps.stat(path);
            if (!stat.isFile()) throw new Error("Not a file");
            const real = await deps.realpath(path);
            if (!(await isAudio(real, stat))) throw new Error(NOT_AUDIO);
            return stat;
        },
        // For audiofile-range: returns the realpath to open. Every failure is
        // the same NOT_AUDIO error, so reads can't be used to probe which
        // paths exist.
        async authorize(path: string): Promise<string> {
            try {
                const real = await deps.realpath(path);
                const stat = await deps.stat(real);
                if (stat.isFile() && (await isAudio(real, stat))) return real;
            } catch {
                // Fall through to the uniform refusal.
            }
            throw new Error(NOT_AUDIO);
        },
    };
}
