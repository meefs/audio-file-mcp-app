import { NOT_AUDIO, NOT_REGISTERED } from "../shared/audio-access-errors.js";

export { NOT_AUDIO, NOT_REGISTERED };

export type AccessStat = { isFile(): boolean; size: number; mtimeMs: number };

export type AccessDeps = {
    realpath: (p: string) => Promise<string>;
    stat: (p: string) => Promise<AccessStat>;
    sniff: (p: string) => Promise<unknown | null>;
};

export type AudioAccess = ReturnType<typeof createAudioAccess>;

// Tracks which files have been opened through display_audio_file, so the range
// resource only serves bytes of audio files the tool has admitted.
export function createAudioAccess(deps: AccessDeps) {
    // Keyed by realpath: a symlink and its target are one entry, and a symlink
    // later re-pointed at another file is not authorised.
    const registered = new Set<string>();
    return {
        async admit(path: string): Promise<AccessStat> {
            const stat = await deps.stat(path);
            if (!stat.isFile()) throw new Error("Not a file");
            if ((await deps.sniff(path)) == null) throw new Error(NOT_AUDIO);
            registered.add(await deps.realpath(path));
            return stat;
        },
        async authorize(path: string): Promise<string> {
            let real: string;
            try {
                real = await deps.realpath(path);
            } catch {
                // Same error as an unregistered file, so reads can't be used
                // to probe which paths exist.
                throw notRegistered();
            }
            if (!registered.has(real)) throw notRegistered();
            return real;
        },
    };
}

function notRegistered(): Error {
    return new Error(
        `${NOT_REGISTERED}: open the file with display_audio_file first`,
    );
}
