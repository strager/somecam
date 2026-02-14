import type { Router } from "vue-router";
import { posthog } from "posthog-js";
import { ANALYTICS_PROXY_TOKEN } from "../shared/analytics-config.ts";

let initialized = false;

export function initAnalytics(router: Router): void {
	if (import.meta.env.MODE === "test" || initialized) {
		return;
	}

	posthog.init(ANALYTICS_PROXY_TOKEN, {
		api_host: "/api/a",
		defaults: "2026-01-30",
		capture_pageview: false, // We capture $pageview ourselves.
		capture_pageleave: true,
	});
	(window as unknown as Record<string, unknown>).posthog = posthog;

	router.afterEach((to) => {
		const routeTemplate = to.matched.at(-1)?.path ?? to.path;
		const sessionParam = to.params.sessionId;
		const sessionId = typeof sessionParam === "string" ? sessionParam : undefined;

		capture("$pageview", {
			$current_url: window.location.href,
			route_name: typeof to.name === "string" ? to.name : undefined,
			route_template: routeTemplate,
			...(sessionId !== undefined ? { session_id: sessionId } : {}),
		});
	});

	initialized = true;
}

export function capture(event: string, properties?: Record<string, unknown>): void {
	if (import.meta.env.MODE === "test") {
		return;
	}
	posthog.capture(event, properties);
}
