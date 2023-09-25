import { autocompletion, CompletionResult, completeFromList } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import type { Extension } from "@codemirror/state";
import type { HighlightStyle, LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import { Tooltip, hoverTooltip } from "@codemirror/view";
import { displayPartsToString } from "typescript";
import { Diagnostic, linter } from "@codemirror/lint";
import { Tag, tags } from "@lezer/highlight";

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
export const typescriptHoverTooltip = (
	env: VirtualTypeScriptEnvironment,
	fileName: string,
	hlStyle: HighlightStyle,
) => {
	return hoverTooltip((view, pos, side) => {
		const tooltip: Tooltip = {
			pos,
			create(_) {
				const quickInfo = env.languageService.getQuickInfoAtPosition(fileName, pos);
				const dom = document.createElement("div");
				if (!quickInfo) return { dom: dom };
				dom.setAttribute("class", "cm-quickinfo-tooltip");
				dom.setAttribute("style", "max-width:700px");
				console.log(quickInfo.displayParts);
				const todo = tags.content;
				const vscodeToCodeMirror: Record<string, Tag> = {
					aliasName: todo,
					className: tags.className,
					enumName: todo,
					fieldName: todo,
					interfaceName: todo,
					keyword: tags.keyword,
					lineBreak: todo,
					numericLiteral: tags.number,
					stringLiteral: tags.string,
					localName: todo,
					methodName: tags.function(tags.propertyName),
					moduleName: todo,
					operator: tags.operator,
					parameterName: todo,
					propertyName: todo,
					punctuation: tags.punctuation,
					space: tags.separator,
					text: tags.content,
					typeParameterName: todo,
					enumMemberName: todo,
					functionName: tags.function(tags.definition(tags.name)),
					regularExpressionLiteral: todo,
					link: tags.link,
					linkName: todo,
					linkText: todo,
				};
				console.log(quickInfo.kind);
				for (const item of quickInfo.displayParts || []) {
					const span = document.createElement("span");
					if (item.kind in vscodeToCodeMirror)
						span.setAttribute("class", hlStyle.style([vscodeToCodeMirror[item.kind]])!);
					span.textContent = item.text;
					dom.appendChild(span);
				}
				return { dom };
			},
		};
		return tooltip;
	});
};
export const tsLinting = (env: VirtualTypeScriptEnvironment, fileName: string): Extension => {
	return linter(() => {
		const diagnostics = env.languageService.getSemanticDiagnostics(fileName);
		return diagnostics.map<Diagnostic>((x) => ({
			from: x.start!,
			to: x.start! + x.length!,
			severity: (["warning", "error", "hint", "info"] as const)[x.category],
			message: x.messageText as string,
		}));
	});
};
