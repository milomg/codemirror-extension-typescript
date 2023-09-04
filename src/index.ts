import { autocompletion, CompletionResult, completeFromList } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import type { LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import { Tooltip, hoverTooltip } from "@codemirror/view";
import { displayPartsToString } from "typescript";
export const tsAutocompletion = (env: VirtualTypeScriptEnvironment, fileName: string): Extension => {
	return autocompletion({
		activateOnTyping: true,
		maxRenderedOptions: 30,
		override: [
			async (ctx): Promise<CompletionResult | null> => {
				const { pos } = ctx;
				try {
					console.log("Getting completitions");
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
export const typescriptHoverTooltip = (env: VirtualTypeScriptEnvironment, fileName: string) => {
	return hoverTooltip((view, pos, side) => {
		const tooltip: Tooltip = {
			pos,
			create(_) {
				const quickInfo = env.languageService.getQuickInfoAtPosition(fileName, pos);
				const dom = document.createElement("div");
				dom.setAttribute("class", "cm-quickinfo-tooltip");
				dom.textContent = quickInfo
					? displayPartsToString(quickInfo.displayParts) +
					  (quickInfo.documentation?.length ? "\n" + displayPartsToString(quickInfo.documentation) : "")
					: "";
				// dom.textContent = '123';
				return { dom };
			},
		};
		return tooltip;
	});
};
