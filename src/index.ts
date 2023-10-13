import {
	autocompletion,
	CompletionResult,
	completeFromList,
	startCompletion,
	CompletionInfo,
} from "@codemirror/autocomplete";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { StateField, type Extension, EditorState } from "@codemirror/state";
import { type HighlightStyle, type LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import { EditorView, Tooltip, hoverTooltip, keymap, showTooltip } from "@codemirror/view";
import { ScriptElementKind, displayPartsToString } from "typescript";
import { Diagnostic, linter } from "@codemirror/lint";
import { highlightTree } from "@lezer/highlight";
import * as markdown from "marked";

function codeToDom(hlStyle: HighlightStyle, code: string): HTMLDivElement {
	const dom = document.createElement("div");
	let last = 0;
	highlightTree(
		javascriptLanguage.parser
			.configure({
				dialect: "typescript",
				top: "Script",
			})
			.parse(code),
		hlStyle,
		(from, to, classes) => {
			if (from > last) {
				const span = document.createElement("span");
				span.textContent = code.slice(last, from);
				dom.appendChild(span);
			}
			const span = document.createElement("span");
			span.setAttribute("class", classes);
			span.textContent = code.slice(from, to);
			dom.appendChild(span);
			last = to;
		},
	);
	return dom;
}

export const tsAutocompletion = (
	env: VirtualTypeScriptEnvironment,
	fileName: string,
	hlStyle: HighlightStyle,
): Extension => {
	return [
		autocompletion({
			activateOnTyping: true,
			override: [
				async (ctx): Promise<CompletionResult | null> => {
					const { pos } = ctx;
					try {
						const completions = env.languageService.getCompletionsAtPosition(fileName, pos, {});

						if (!completions) return null;

						// type Input = ScriptElementKind
						const map: Record<
							string,
							| "class"
							| "constant"
							| "enum"
							| "function"
							| "interface"
							| "keyword"
							| "method"
							| "namespace"
							| "property"
							| "text"
							| "type"
							| "variable"
						> = {
							class: "class",
							keyword: "keyword",
							interface: "interface",
							method: "method",
							module: "namespace",
							property: "property",
							string: "text",
							type: "type",
							var: "variable",
							const: "constant",
						};

						return completeFromList(
							completions.entries.map((c, _) => ({
								type: map[c.kind] || c.kind,
								label: c.name,
								info: () => {
									const details = env.languageService.getCompletionEntryDetails(
										fileName,
										pos,
										c.name,
										{},
										undefined,
										undefined,
										undefined,
									);
									if (!details) return null;

									const dom = document.createElement("div");

									const todo = displayPartsToString(details.displayParts);
									const code = codeToDom(hlStyle, todo);
									code.className = "cm-completionInfo-right-code";
									dom.appendChild(code);

									if (details.documentation?.length) {
										const docs = document.createElement("div");
										docs.className = "cm-tooltip-docs";
										const output = markdown.parse(displayPartsToString(details.documentation));
										docs.innerHTML = output;
										dom.appendChild(docs);
									}

									return { dom: dom } as CompletionInfo;
								},
								boost: 1 / Number(c.sortText),
							})),
						)(ctx);
					} catch (e) {
						console.log("Unable to get completions", { pos, error: e });
						return null;
					}
				},
			],
		}),
		keymap.of([
			{
				key: ".",
				run: (x) => {
					// TODO: fix this hack
					setTimeout(() => startCompletion(x), 1);
					return false;
				},
			},
		]),
	];
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
		const quickInfo = env.languageService.getQuickInfoAtPosition(fileName, pos);
		if (!quickInfo) return null;

		const tooltip: Tooltip = {
			pos: quickInfo.textSpan.start,
			end: quickInfo.textSpan.start + quickInfo.textSpan.length,
			create(_) {
				const dom = document.createElement("div");
				if (!quickInfo) return { dom: dom };
				dom.setAttribute("class", "cm-quickinfo-tooltip");

				const todo = displayPartsToString(quickInfo.displayParts);
				const code = codeToDom(hlStyle, todo);
				code.setAttribute("class", "cm-quickinfo-tooltip-code");
				dom.appendChild(code);

				if (quickInfo.documentation?.length) {
					const docs = document.createElement("div");
					docs.className = "cm-tooltip-docs";
					const output = markdown.parse(displayPartsToString(quickInfo.documentation));
					docs.innerHTML = output;
					dom.appendChild(docs);
				}

				return { dom: dom, overlap: true };
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

export const paramTooltip = (env: VirtualTypeScriptEnvironment, fileName: string) => {
	function getCursorTooltips(state: EditorState): readonly Tooltip[] {
		return state.selection.ranges
			.filter((range) => range.empty)
			.map<Tooltip | undefined>((range) => {
				const signatureItems = env.languageService.getSignatureHelpItems(fileName, range.head, {});

				if (!signatureItems) return undefined;

				let x = signatureItems.items[signatureItems.selectedItemIndex];

				return {
					pos: range.head,
					above: true,
					// strictSide: true,
					create: () => {
						let dom = document.createElement("div");
						dom.className = "cm-tooltip-parameters";

						let code = document.createElement("div");
						code.className = "cm-tooltip-param-code";

						code.appendChild(document.createTextNode(displayPartsToString(x.prefixDisplayParts)));

						const separator = displayPartsToString(x.separatorDisplayParts);
						for (let i = 0; i < x.parameters.length; i++) {
							if (i) code.appendChild(document.createTextNode(separator));

							const text = displayPartsToString(x.parameters[i].displayParts);

							if (signatureItems.argumentIndex === i) {
								const bold = document.createElement("b");
								bold.textContent = text;
								code.appendChild(bold);
							} else {
								code.appendChild(document.createTextNode(text));
							}
						}
						code.appendChild(document.createTextNode(displayPartsToString(x.suffixDisplayParts)));
						dom.appendChild(code);

						if (x.documentation.length) {
							const docs = document.createElement("div");
							docs.className = "cm-tooltip-docs";
							docs.innerHTML = markdown.parse(displayPartsToString(x.documentation));
							dom.appendChild(docs);
						}

						for (const param of x.parameters) {
							if (!param.documentation.length) continue;

							const docs = document.createElement("div");
							docs.className = "cm-tooltip-docs";
							docs.innerHTML = markdown.parse(displayPartsToString(param.documentation));
							dom.appendChild(docs);
						}

						return { dom: dom, overlap: true };
					},
				};
			})
			.filter((x): x is Tooltip => x !== undefined);
	}

	return StateField.define<readonly Tooltip[]>({
		create: getCursorTooltips,

		update(tooltips, tr) {
			return getCursorTooltips(tr.state);
		},

		provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
	});
};

export const typescriptBaseTheme = EditorView.theme({
	".cm-tooltip": {
		"max-width": "700px",
		"max-height": "250px",
		"border": "1px solid #454545",
	},
	".cm-tooltip-parameters, .cm-quickinfo-tooltip, .cm-completionInfo-right": {
		"overflow-y": "scroll",
	},
	".cm-quickinfo-tooltip-code, .cm-tooltip-param-code, .cm-completionInfo-right-code": {
		"white-space": "pre-wrap",
		"padding": "8px",
		"font-family": 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
	},
	".cm-tooltip-docs": {
		"padding": "8px",
		"border-top": "1px solid #454545",
	},
	".cm-tooltip-docs p:first-child": {
		"margin-top": "0",
	},
	".cm-tooltip-docs p:last-child": {
		"margin-bottom": "0",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul": {
		"font-family": 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
	},
	".cm-completionMatchedText": {
		"text-decoration": "none",
		"color": "#2aaaff",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		background: "#04395e",
		color: "unset",
	},
	"a": {
		"color": "#3794ff",
		"text-decoration": "inherit",
	},
	".cm-tooltip-hover": {
		"z-index": "150",
	},
	".cm-completionInfo-right": {
		padding: "0",
	},
});
