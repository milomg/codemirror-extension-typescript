import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { type LanguageSupport } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { VirtualTypeScriptEnvironment } from "@typescript/vfs";
import {
	LSPClient,
	LSPPlugin,
	type Transport,
	findReferencesKeymap,
	formatKeymap,
	hoverTooltips,
	jumpToDefinitionKeymap,
	renameKeymap,
	serverCompletionSource,
	serverDiagnostics,
	signatureHelp,
} from "@codemirror/lsp-client";
import { autocompletion, type CompletionSource } from "@codemirror/autocomplete";
import ts, { displayPartsToString } from "typescript";

export const typescript = ({ jsx }: { jsx: boolean } = { jsx: false }): LanguageSupport => {
	return javascript({ typescript: true, jsx });
};

const monospace = 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace';

export const typescriptLspTheme: Extension = EditorView.theme({
	".cm-lsp-hover-tooltip, .cm-lsp-signature-tooltip, .cm-lsp-completion-documentation": {
		"max-width": "700px",
		"max-height": "250px",
		"overflow": "auto",
		"border": "1px solid #454545",
		"padding": "0",
	},
	".cm-lsp-completion-documentation": {
		"max-width": "500px",
	},
	".cm-lsp-hover-tooltip pre, .cm-lsp-completion-documentation pre": {
		"white-space": "pre-wrap",
		"font-family": monospace,
		"margin": "0",
		"padding": "8px",
		"border-bottom": "1px solid #454545",
	},
	".cm-lsp-hover-tooltip > p, .cm-lsp-completion-documentation > p, .cm-lsp-signature-tooltip > p": {
		"padding": "0 8px",
	},
	".cm-lsp-signature-tooltip": {
		"padding": "0",
	},
	".cm-lsp-signature": {
		"padding": "8px",
		"font-family": monospace,
	},
	".cm-lsp-signature-tooltip .cm-lsp-documentation": {
		"padding": "8px",
	},
	".cm-lsp-signature-documentation": {
		"border-top": "1px solid #454545",
	},
	".cm-lsp-documentation p:first-child": { "margin-top": "0" },
	".cm-lsp-documentation p:last-child": { "margin-bottom": "0" },
	".cm-tooltip.cm-tooltip-autocomplete > ul": {
		"font-family": monospace,
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		background: "#04395e",
		color: "unset",
	},
	".cm-completionMatchedText": {
		"text-decoration": "none",
		"color": "#2aaaff",
	},
	".cm-completionDetail": {
		"text-overflow": "ellipsis",
		"overflow": "hidden",
		"max-width": "350px",
		"display": "inline-block",
		"float": "right",
	},
	".cm-tooltip-hover": {
		"z-index": "150",
	},
	"a": {
		"color": "#3794ff",
		"text-decoration": "inherit",
	},
});

const completionItemKind: Record<string, number> = {
	"class": 7,
	"interface": 8,
	"method": 2,
	"module": 9,
	"property": 10,
	"string": 1,
	"type": 22,
	"var": 6,
	"local var": 6,
	"const": 21,
	"let": 21,
	"function": 3,
	"local function": 3,
	"keyword": 14,
	"enum": 13,
	"enum member": 20,
	"parameter": 6,
	"alias": 18,
	"primitive": 22,
};

const diagnosticSeverity: Record<number, number> = {
	[ts.DiagnosticCategory.Error]: 1,
	[ts.DiagnosticCategory.Warning]: 2,
	[ts.DiagnosticCategory.Suggestion]: 4,
	[ts.DiagnosticCategory.Message]: 3,
};

type Position = { line: number; character: number };

function makePositionConverters(env: VirtualTypeScriptEnvironment, uri: string) {
	const sourceFile = env.getSourceFile(uri);
	const offsetToPos = (offset: number): Position => {
		if (!sourceFile) return { line: 0, character: 0 };
		const lc = sourceFile.getLineAndCharacterOfPosition(offset);
		return { line: lc.line, character: lc.character };
	};
	const posToOffset = (pos: Position): number => {
		if (!sourceFile) return 0;
		return ts.getPositionOfLineAndCharacter(sourceFile, pos.line, pos.character);
	};
	return { offsetToPos, posToOffset };
}

export function createTypescriptTransport(env: VirtualTypeScriptEnvironment): Transport {
	const handlers = new Set<(value: string) => void>();

	const dispatch = (msg: object) => {
		const json = JSON.stringify(msg);
		queueMicrotask(() => {
			for (const h of handlers) h(json);
		});
	};

	const reply = (id: number | string, result: unknown) => dispatch({ jsonrpc: "2.0", id, result });

	const replyError = (id: number | string, code: number, message: string) =>
		dispatch({ jsonrpc: "2.0", id, error: { code, message } });

	const notify = (method: string, params: unknown) => dispatch({ jsonrpc: "2.0", method, params });

	const publishDiagnostics = (uri: string) => {
		const { offsetToPos } = makePositionConverters(env, uri);
		const tsDiagnostics = [
			...env.languageService.getSyntacticDiagnostics(uri),
			...env.languageService.getSemanticDiagnostics(uri),
		];
		const diagnostics = tsDiagnostics.map((d) => {
			const start = d.start ?? 0;
			const length = d.length ?? 0;
			return {
				range: { start: offsetToPos(start), end: offsetToPos(start + length) },
				severity: diagnosticSeverity[d.category] ?? 1,
				source: "typescript",
				message: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
			};
		});
		notify("textDocument/publishDiagnostics", { uri, diagnostics });
	};

	const handleRequest = (id: number | string, method: string, params: any) => {
		try {
			switch (method) {
				case "initialize":
					return reply(id, {
						capabilities: {
							textDocumentSync: 1,
							hoverProvider: true,
							completionProvider: {
								resolveProvider: true,
								triggerCharacters: ["."],
							},
							signatureHelpProvider: {
								triggerCharacters: ["(", ","],
								retriggerCharacters: [")"],
							},
						},
					});

				case "shutdown":
					return reply(id, null);

				case "textDocument/completion": {
					const uri = params.textDocument.uri;
					const { posToOffset } = makePositionConverters(env, uri);
					const offset = posToOffset(params.position);
					const completions = env.languageService.getCompletionsAtPosition(uri, offset, {});
					if (!completions) return reply(id, null);
					return reply(id, {
						isIncomplete: !!completions.isIncomplete,
						items: completions.entries.map((c) => ({
							label: c.name,
							kind: completionItemKind[c.kind] ?? 1,
							sortText: c.sortText,
							data: { uri, offset, name: c.name, source: c.source },
						})),
					});
				}

				case "completionItem/resolve": {
					const data = params.data;
					if (!data) return reply(id, params);
					const details = env.languageService.getCompletionEntryDetails(
						data.uri,
						data.offset,
						data.name,
						{},
						data.source,
						undefined,
						undefined,
					);
					if (!details) return reply(id, params);
					const detail = displayPartsToString(details.displayParts);
					const docs = displayPartsToString(details.documentation);
					return reply(id, {
						...params,
						detail,
						documentation: docs ? { kind: "markdown", value: docs } : undefined,
					});
				}

				case "textDocument/hover": {
					const uri = params.textDocument.uri;
					const { posToOffset, offsetToPos } = makePositionConverters(env, uri);
					const offset = posToOffset(params.position);
					const info = env.languageService.getQuickInfoAtPosition(uri, offset);
					if (!info) return reply(id, null);
					const signature = displayPartsToString(info.displayParts);
					const docs = displayPartsToString(info.documentation ?? []);
					const value = "```typescript\n" + signature + "\n```" + (docs ? "\n\n" + docs : "");
					return reply(id, {
						contents: { kind: "markdown", value },
						range: {
							start: offsetToPos(info.textSpan.start),
							end: offsetToPos(info.textSpan.start + info.textSpan.length),
						},
					});
				}

				case "textDocument/signatureHelp": {
					const uri = params.textDocument.uri;
					const { posToOffset } = makePositionConverters(env, uri);
					const offset = posToOffset(params.position);
					const help = env.languageService.getSignatureHelpItems(uri, offset, {});
					if (!help) return reply(id, null);
					return reply(id, {
						signatures: help.items.map((item) => {
							const prefix = displayPartsToString(item.prefixDisplayParts);
							const separator = displayPartsToString(item.separatorDisplayParts);
							const suffix = displayPartsToString(item.suffixDisplayParts);
							const params = item.parameters.map((p) => ({
								text: displayPartsToString(p.displayParts),
								doc: displayPartsToString(p.documentation),
							}));
							const label = prefix + params.map((p) => p.text).join(separator) + suffix;
							let cursor = prefix.length;
							const lspParams = params.map((p) => {
								const start = cursor;
								const end = start + p.text.length;
								cursor = end + separator.length;
								return {
									label: [start, end] as [number, number],
									documentation: p.doc ? { kind: "markdown", value: p.doc } : undefined,
								};
							});
							const itemDocs = displayPartsToString(item.documentation);
							return {
								label,
								documentation: itemDocs ? { kind: "markdown", value: itemDocs } : undefined,
								parameters: lspParams,
							};
						}),
						activeSignature: help.selectedItemIndex,
						activeParameter: help.argumentIndex,
					});
				}

				default:
					return replyError(id, -32601, "Method not found: " + method);
			}
		} catch (e: any) {
			return replyError(id, -32603, e?.message ?? "Internal error");
		}
	};

	const handleNotification = (method: string, params: any) => {
		switch (method) {
			case "initialized":
				return;
			case "textDocument/didOpen": {
				const uri = params.textDocument.uri;
				env.updateFile(uri, params.textDocument.text);
				publishDiagnostics(uri);
				return;
			}
			case "textDocument/didChange": {
				const uri = params.textDocument.uri;
				const change = params.contentChanges[params.contentChanges.length - 1];
				if (change && "text" in change && !("range" in change)) {
					env.updateFile(uri, change.text);
				}
				publishDiagnostics(uri);
				return;
			}
			case "textDocument/didClose":
				return;
			default:
				return;
		}
	};

	return {
		send(message) {
			let msg: any;
			try {
				msg = JSON.parse(message);
			} catch {
				return;
			}
			if (msg.id !== undefined && msg.method) {
				handleRequest(msg.id, msg.method, msg.params);
			} else if (msg.method) {
				handleNotification(msg.method, msg.params);
			}
		},
		subscribe(handler) {
			handlers.add(handler);
		},
		unsubscribe(handler) {
			handlers.delete(handler);
		},
	};
}

function lazyInfoCompletionSource(env: VirtualTypeScriptEnvironment): CompletionSource {
	return async (ctx) => {
		const plugin = LSPPlugin.get(ctx.view!);
		if (!plugin) return null;
		const uri = plugin.uri;
		const offset = ctx.pos;
		const result = await Promise.resolve(serverCompletionSource(ctx));
		if (!result) return null;
		return {
			...result,
			options: result.options.map((opt) => ({
				...opt,
				info:
					opt.info ??
					(() => {
						const details = env.languageService.getCompletionEntryDetails(
							uri,
							offset,
							opt.label,
							{},
							undefined,
							undefined,
							undefined,
						);
						if (!details) return null;
						const sig = displayPartsToString(details.displayParts);
						const docs = displayPartsToString(details.documentation);
						if (!sig && !docs) return null;
						const md = (sig ? "```typescript\n" + sig + "\n```" : "") + (docs ? "\n\n" + docs : "");
						const elt = document.createElement("div");
						elt.className = "cm-lsp-documentation cm-lsp-completion-documentation";
						elt.innerHTML = plugin.docToHTML({ kind: "markdown", value: md });
						return elt;
					}),
			})),
		};
	};
}

export function createTypescriptLSPClient(env: VirtualTypeScriptEnvironment): LSPClient {
	const client = new LSPClient({
		extensions: [
			autocompletion({ override: [lazyInfoCompletionSource(env)] }),
			hoverTooltips(),
			signatureHelp(),
			serverDiagnostics(),
			keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap]),
		],
		highlightLanguage: (name) =>
			name === "typescript" || name === "javascript" || name === "ts" || name === "js" ? javascriptLanguage : null,
	});
	client.connect(createTypescriptTransport(env));
	return client;
}
