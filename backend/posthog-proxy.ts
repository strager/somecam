import express, { type Request, type Router } from "express";

import { ANALYTICS_PROXY_TOKEN } from "../shared/analytics-config.ts";

const POSTHOG_API_HOST = "us.i.posthog.com";
const POSTHOG_ASSET_HOST = "us-assets.i.posthog.com";

const ALLOWED_REQUEST_HEADERS = new Set(["accept", "accept-encoding", "content-encoding", "content-type", "user-agent"]);

const ALLOWED_RESPONSE_HEADERS = new Set(["cache-control", "content-length", "content-type", "date", "etag", "expires", "last-modified", "vary"]);

const ALLOWED_POST_PATHS = new Set(["/batch", "/batch/", "/capture", "/capture/", "/decide", "/decide/", "/e", "/e/", "/flags", "/flags/", "/s", "/s/"]);
const ALLOWED_GET_PATHS = new Set(["/flags", "/flags/"]);

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
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

export function resolvePosthogHost(pathname: string): string {
	return pathname.startsWith("/static/") || pathname.startsWith("/array/") ? POSTHOG_ASSET_HOST : POSTHOG_API_HOST;
}

export function isAllowedEndpoint(method: string, pathname: string): boolean {
	if (pathname.startsWith("/static/") || pathname.startsWith("/array/")) {
		return method === "GET" || method === "HEAD";
	}
	if (method === "POST") {
		return ALLOWED_POST_PATHS.has(pathname);
	}
	if (method === "GET") {
		return ALLOWED_GET_PATHS.has(pathname);
	}
	return false;
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

export function expectedOrigin(req: Request): string | undefined {
	const host = requestHost(req);
	if (host === undefined) {
		return undefined;
	}
	return `${requestProtocol(req)}://${host}`;
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

export function isAllowedOrigin(req: Request): boolean {
	const expected = expectedOrigin(req);
	if (expected === undefined) {
		return false;
	}

	const origin = originFromUrlHeader(req.headers.origin);
	if (origin !== undefined) {
		return origin === expected;
	}

	const refererOrigin = originFromUrlHeader(req.headers.referer);
	if (refererOrigin !== undefined) {
		return refererOrigin === expected;
	}

	return false;
}

export function shouldCheckOrigin(method: string, pathname: string): boolean {
	if (pathname.startsWith("/static/")) {
		return false;
	}
	return method !== "GET" && method !== "HEAD";
}

export function copyRequestHeaders(headers: Record<string, string | string[] | undefined>): Headers {
	const result = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (value === undefined) {
			continue;
		}
		const normalized = name.toLowerCase();
		if (!ALLOWED_REQUEST_HEADERS.has(normalized)) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				result.append(name, item);
			}
		} else {
			result.set(name, value);
		}
	}
	return result;
}

export function rewriteArrayProxyPath(pathname: string, apiKey: string): string {
	const prefix = `/array/${ANALYTICS_PROXY_TOKEN}/`;
	if (!pathname.startsWith(prefix)) {
		return pathname;
	}
	return `/array/${apiKey}/${pathname.slice(prefix.length)}`;
}

export function isAssetPath(pathname: string): boolean {
	return pathname.startsWith("/static/") || pathname.startsWith("/array/");
}

export function rewriteTokenInBody(data: unknown, apiKey: string): void {
	if (Array.isArray(data)) {
		for (const element of data as unknown[]) {
			if (element !== null && typeof element === "object" && "properties" in element) {
				const props = (element as Record<string, unknown>).properties as Record<string, unknown>;
				if (props.token === ANALYTICS_PROXY_TOKEN) {
					props.token = apiKey;
				}
			}
		}
	} else if (data !== null && typeof data === "object") {
		const obj = data as Record<string, unknown>;
		if (obj.token === ANALYTICS_PROXY_TOKEN) {
			obj.token = apiKey;
		}
		if ("properties" in obj && obj.properties !== null && typeof obj.properties === "object") {
			const props = obj.properties as Record<string, unknown>;
			if (props.token === ANALYTICS_PROXY_TOKEN) {
				props.token = apiKey;
			}
		}
	}
}

export function hasJsonContentType(contentType: string | undefined): boolean {
	if (contentType === undefined) {
		return false;
	}
	return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

export function createUpstreamUrl(pathWithQuery: string, posthogHost: string, apiKey: string): URL {
	const url = new URL(pathWithQuery, `https://${posthogHost}`);
	if (url.pathname.startsWith(`/array/${ANALYTICS_PROXY_TOKEN}/`)) {
		url.pathname = rewriteArrayProxyPath(url.pathname, apiKey);
	}
	if (!isAssetPath(url.pathname)) {
		url.searchParams.set("api_key", apiKey);
	}
	return url;
}

export function sanitizeResponseHeaders(headers: Headers): Headers {
	const sanitized = new Headers(headers);
	if (sanitized.has("content-encoding")) {
		sanitized.delete("content-encoding");
		sanitized.delete("content-length");
	}
	for (const name of [...sanitized.keys()]) {
		if (!ALLOWED_RESPONSE_HEADERS.has(name.toLowerCase())) {
			sanitized.delete(name);
		}
	}
	return sanitized;
}

export function createAnalyticsHandler(): Router {
	const router = express.Router();
	const apiKey = process.env.POSTHOG_KEY;

	if (apiKey === undefined || apiKey === "") {
		let warned = false;
		router.use((_req, res) => {
			if (!warned) {
				warned = true;
				console.warn("POSTHOG_KEY is not set; analytics requests will be ignored.");
			}
			res.status(200).end();
		});
		return router;
	}

	router.use(express.raw({ type: "*/*" }));
	router.use(async (req, res, next) => {
		try {
			const method = req.method.toUpperCase();
			const pathname = req.path;

			if (!isAllowedEndpoint(method, pathname)) {
				res.status(404).end();
				return;
			}

			if (shouldCheckOrigin(method, pathname) && !isAllowedOrigin(req)) {
				res.status(403).end();
				return;
			}

			if (method === "POST" && !isAssetPath(pathname) && !hasJsonContentType(firstHeaderValue(req.headers["content-type"]))) {
				res.status(400).end();
				return;
			}

			const posthogHost = resolvePosthogHost(pathname);
			const headers = copyRequestHeaders(req.headers);
			headers.set("host", posthogHost);

			const host = requestHost(req);
			if (host !== undefined) {
				headers.set("x-forwarded-host", host);
			}

			headers.set("x-forwarded-proto", requestProtocol(req));

			if (req.socket.remoteAddress !== undefined) {
				headers.set("x-real-ip", req.socket.remoteAddress);
				headers.set("x-forwarded-for", req.socket.remoteAddress);
			}

			let body: string | undefined;
			if (method !== "GET" && method !== "HEAD" && Buffer.isBuffer(req.body)) {
				const parsed: unknown = JSON.parse(req.body.toString("utf-8"));
				rewriteTokenInBody(parsed, apiKey);
				body = JSON.stringify(parsed);
			}
			const upstreamResponse = await fetch(createUpstreamUrl(req.url, posthogHost, apiKey), {
				method,
				headers,
				body,
			});

			res.status(upstreamResponse.status);
			const responseHeaders = sanitizeResponseHeaders(upstreamResponse.headers);
			for (const [name, value] of responseHeaders.entries()) {
				res.setHeader(name, value);
			}

			const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());
			res.send(responseBody);
		} catch (error) {
			next(error);
		}
	});

	return router;
}
