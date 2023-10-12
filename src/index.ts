import { autocompletion, CompletionResult, completeFromList, startCompletion } from "@codemirror/autocomplete";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { StateField, type Extension, EditorState } from "@codemirror/state";
import { type HighlightStyle, type LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import { EditorView, Tooltip, hoverTooltip, keymap, showTooltip } from "@codemirror/view";
import { ScriptElementKind, displayPartsToString } from "typescript";
import { Diagnostic, linter } from "@codemirror/lint";
import { highlightTree } from "@lezer/highlight";
import * as markdown from "marked";

export const tsAutocompletion = (env: VirtualTypeScriptEnvironment, fileName: string): Extension => {
	return [
		autocompletion({
			activateOnTyping: true,
			maxRenderedOptions: 30,
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
				const outer = document.createElement("div");
				if (!quickInfo) return { dom: outer };
				outer.setAttribute("class", "cm-quickinfo-tooltip");

				const dom = document.createElement("div");
				dom.setAttribute("class", "cm-quickinfo-tooltip-code");
				const todo = displayPartsToString(quickInfo.displayParts);

				let last = 0;
				highlightTree(
					javascriptLanguage.parser
						.configure({
							dialect: "typescript",
							top: "Script",
						})
						.parse(todo),
					hlStyle,
					(from, to, classes) => {
						if (from > last) {
							const span = document.createElement("span");
							span.textContent = todo.slice(last, from);
							dom.appendChild(span);
						}
						const span = document.createElement("span");
						span.setAttribute("class", classes);
						span.textContent = todo.slice(from, to);
						dom.appendChild(span);
						last = to;
					},
				);
				outer.appendChild(dom);

				if (quickInfo.documentation?.length) {
					const docs = document.createElement("div");
					docs.className = "cm-quickinfo-tooltip-docs";
					const output = markdown.parse(displayPartsToString(quickInfo.documentation));
					docs.innerHTML = output;
					outer.appendChild(docs);
				}

				return { dom: outer };
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
						let outer = document.createElement("div");
						outer.className = "cm-tooltip-parameters";

						let dom = document.createElement("div");
						dom.className = "cm-tooltip-param-code";

						dom.appendChild(document.createTextNode(displayPartsToString(x.prefixDisplayParts)));

						const separator = displayPartsToString(x.separatorDisplayParts);
						for (let i = 0; i < x.parameters.length; i++) {
							if (i) dom.appendChild(document.createTextNode(separator));

							const text = displayPartsToString(x.parameters[i].displayParts);

							if (signatureItems.argumentIndex === i) {
								const bold = document.createElement("b");
								bold.textContent = text;
								dom.appendChild(bold);
							} else {
								dom.appendChild(document.createTextNode(text));
							}
						}
						dom.appendChild(document.createTextNode(displayPartsToString(x.suffixDisplayParts)));
						outer.appendChild(dom);

						if (x.documentation) {
							const docs = document.createElement("div");
							docs.className = "cm-tooltip-param-docs";
							docs.innerHTML = markdown.parse(displayPartsToString(x.documentation));
							outer.appendChild(docs);
						}

						for (const param of x.parameters) {
							if (!param.documentation.length) continue;

							const docs = document.createElement("div");
							docs.className = "cm-tooltip-param-docs";
							docs.innerHTML = markdown.parse(displayPartsToString(param.documentation));
							outer.appendChild(docs);
						}

						return { dom: outer };
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

export const typescriptBaseTheme = EditorView.baseTheme({
	".cm-tooltip.cm-tooltip-parameters, .cm-quickinfo-tooltip": {
		"max-width": "700px",
		"border": "1px solid #454545",
	},
	".cm-quickinfo-tooltip-code, .cm-tooltip-param-code": {
		"white-space": "pre-wrap",
		"padding": "8px",
		"font-family": 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
	},
	".cm-quickinfo-tooltip-docs, .cm-tooltip-param-docs": {
		"padding": "8px",
		"border-top": "1px solid #454545",
	},
});
