import { autocompletion, CompletionResult, completeFromList } from "@codemirror/autocomplete";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
export const tsAutocompletion = (env: VirtualTypeScriptEnvironment, fileName: string) => {
	autocompletion({
		activateOnTyping: true,
		maxRenderedOptions: 30,
		override: [
			async (ctx): Promise<CompletionResult | null> => {
				const { pos } = ctx;
				try {
					const completions = env.languageService.getCompletionsAtPosition(fileName, pos, {});
					if (!completions) {
						console.log("Unable to get completions", { pos });
						return null;
					}
					return completeFromList(
						completions.entries.map((c, _) => ({
							type: c.kind,
							label: c.name,
							boost: 1 / Number(c.sortText),
						})),
					)(ctx);
				} catch (e) {
					console.log("Unable to get completions", { pos, error: e });
					return null;
				}
			},
		],
	});
};
