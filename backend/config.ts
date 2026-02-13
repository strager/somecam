export interface AppConfig {
	xaiApiKey: string;
	debugPrompt: boolean;
}

export function loadConfig(): AppConfig {
	const xaiApiKey = process.env.XAI_API_KEY;
	if (xaiApiKey === undefined || xaiApiKey === "") {
		throw new Error("XAI_API_KEY environment variable is required but not set.");
	}
	return { xaiApiKey, debugPrompt: Boolean(process.env.DEBUG_PROMPT) };
}
