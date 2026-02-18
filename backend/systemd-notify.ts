import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function notifyReady(): Promise<void> {
	if (process.env.NOTIFY_SOCKET === undefined || process.env.NOTIFY_SOCKET === "") {
		return;
	}

	try {
		await execFileAsync("systemd-notify", ["--ready"]);
	} catch (error: unknown) {
		console.error("sd_notify failed:", error);
	}
}
