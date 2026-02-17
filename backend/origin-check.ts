import type { Request } from "express";

export function firstHeaderValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

function firstCommaSeparatedValue(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const first = value
		.split(",")
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	return first;
}

export function requestHost(req: Request): string | undefined {
	const forwardedHost = firstCommaSeparatedValue(firstHeaderValue(req.headers["x-forwarded-host"]));
	if (forwardedHost !== undefined && forwardedHost.length > 0) {
		return forwardedHost;
	}
	const host = firstHeaderValue(req.headers.host);
	if (host === undefined || host.length === 0) {
		return undefined;
	}
	return host;
}

export function requestProtocol(req: Request): "http" | "https" {
	const forwardedProto = firstCommaSeparatedValue(firstHeaderValue(req.headers["x-forwarded-proto"]));
	if (forwardedProto === "https" || forwardedProto === "http") {
		return forwardedProto;
	}
	return req.protocol === "https" ? "https" : "http";
}

export function originFromUrlHeader(value: string | string[] | undefined): string | undefined {
	const raw = firstHeaderValue(value);
	if (raw === undefined || raw.length === 0 || raw === "null") {
		return undefined;
	}
	try {
		return new URL(raw).origin;
	} catch {
		return undefined;
	}
}

export function isAllowedOrigin(req: Request, configuredOrigin: string | undefined): boolean {
	if (configuredOrigin === undefined) {
		return false;
	}

	const origin = originFromUrlHeader(req.headers.origin);
	if (origin !== undefined) {
		return origin === configuredOrigin;
	}

	const refererOrigin = originFromUrlHeader(req.headers.referer);
	if (refererOrigin !== undefined) {
		return refererOrigin === configuredOrigin;
	}

	return false;
}

export function shouldCheckOrigin(method: string): boolean {
	return method !== "GET" && method !== "HEAD";
}
