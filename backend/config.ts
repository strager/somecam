export interface AppConfig {
	xaiApiKey: string;
}

export function loadConfig(): AppConfig {
	const xaiApiKey = process.env.XAI_API_KEY;
	if (xaiApiKey === undefined || xaiApiKey === "") {
		throw new Error("XAI_API_KEY environment variable is required but not set.");
	}
	return { xaiApiKey };
}
