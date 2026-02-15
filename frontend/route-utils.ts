import type { RouteLocationNormalizedLoaded } from "vue-router";
import { useRoute } from "vue-router";

export function useStringParam(name: string): string {
	return requireStringParam(useRoute(), name);
}

export function requireStringParam(route: RouteLocationNormalizedLoaded, name: string): string {
	const value = route.params[name];
	if (typeof value !== "string") {
		throw new Error(`Expected route param "${name}" to be a string`);
	}
	return value;
}
