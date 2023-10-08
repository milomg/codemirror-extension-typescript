import { autocompletion, CompletionResult, completeFromList, startCompletion } from "@codemirror/autocomplete";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { StateField, type Extension, EditorState, Prec } from "@codemirror/state";
import { type HighlightStyle, type LanguageSupport } from "@codemirror/language";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import { EditorView, Tooltip, hoverTooltip, keymap, showTooltip } from "@codemirror/view";
import { ScriptElementKind, displayPartsToString } from "typescript";
import { Diagnostic, linter } from "@codemirror/lint";
import { highlightTree } from "@lezer/highlight";

export const tsAutocompletion = (env: VirtualTypeScriptEnvironment, fileName: string): Extension => {
	return [
		autocompletion({
			activateOnTyping: true,
			maxRenderedOptions: 30,
			override: [
				async (ctx): Promise<CompletionResult | null> => {
					console.log("called");
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
		const tooltip: Tooltip = {
			pos,
			create(_) {
				const quickInfo = env.languageService.getQuickInfoAtPosition(fileName, pos);
				const dom = document.createElement("div");
				if (!quickInfo) return { dom: dom };
				dom.setAttribute("class", "cm-quickinfo-tooltip");
				dom.setAttribute(
					"style",
					'max-width:700px;font-family:Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
				);
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

export const paramTooltip = (env: VirtualTypeScriptEnvironment, fileName: string) => {
	const cursorTooltipField = StateField.define<readonly Tooltip[]>({
		create: getCursorTooltips,

		update(tooltips, tr) {
			return getCursorTooltips(tr.state);
		},

		provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
	});
	function getCursorTooltips(state: EditorState): readonly Tooltip[] {
		return state.selection.ranges
			.filter((range) => range.empty)
			.map<Tooltip | undefined>((range) => {
				const signatureItems = env.languageService.getSignatureHelpItems(fileName, range.head, {});
				const text = signatureItems?.items.map(
					(x) =>
						displayPartsToString(x.prefixDisplayParts) +
						x.parameters
							.map((x) => displayPartsToString(x.displayParts))
							.join(displayPartsToString(x.separatorDisplayParts)) +
						displayPartsToString(x.suffixDisplayParts),
				);
				if (!text) return undefined;
				return {
					pos: range.head,
					above: true,
					// strictSide: true,
					create: () => {
						let dom = document.createElement("div");
						dom.className = "cm-tooltip-parameters";
						dom.textContent = text?.[0]!;
						return { dom };
					},
				};
			})
			.filter((x): x is Tooltip => x !== undefined);
	}
	const cursorTooltipBaseTheme = EditorView.baseTheme({
		".cm-tooltip.cm-tooltip-parameters": {
			"max-width": "700px",
		},
	});

	return [cursorTooltipField, cursorTooltipBaseTheme];
};
