const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashStrings(...parts: string[]): number {
	let h = FNV_OFFSET;
	for (let p = 0; p < parts.length; p++) {
		if (p > 0) {
			h ^= 0xff;
			h = Math.imul(h, FNV_PRIME) >>> 0;
		}
		const s = parts[p];
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i) & 0xff;
			h = Math.imul(h, FNV_PRIME) >>> 0;
		}
	}
	return h >>> 0;
}
