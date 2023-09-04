import { autocompletion, CompletionResult, completeFromList } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import type { LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
export const tsAutocompletion = (env: VirtualTypeScriptEnvironment, fileName: string): Extension => {
	return autocompletion({
		activateOnTyping: true,
		maxRenderedOptions: 30,
		override: [
			async (ctx): Promise<CompletionResult | null> => {
				const { pos } = ctx;
				try {
					console.log("Getting completitions")
					const completions = env.languageService.getCompletionsAtPosition(fileName, pos, {});
					console.log(completions);
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
export const typescript = ({ jsx }: { jsx: boolean } = { jsx: false }): LanguageSupport => {
	return javascript({ typescript: true, jsx });
};
