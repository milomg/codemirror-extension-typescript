import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts, { CompilerOptions, ModuleKind, ModuleResolutionKind, ScriptTarget } from "typescript";
import { tsAutocompletion, typescript, typescriptHoverTooltip } from "../../../../src";
import { basicSetup, EditorView, minimalSetup } from "codemirror";

import { createEffect, createSignal } from "solid-js";
import { vsCodeDarkPlusTheme, vsCodeDarkPlusHighlightStyle } from "./vs-code-dark-plus";
import { syntaxHighlighting } from "@codemirror/language";

const types = import.meta.glob("../../../../node_modules/typescript/lib/*", {
	eager: true,
	as: "raw",
});
const compilerOptions: CompilerOptions = {
	strict: true,
	target: ScriptTarget.ES2015,
	module: ModuleKind.ES2015,
	moduleResolution: ModuleResolutionKind.Node10,
	allowNonTsExtensions: true,
};
const fsMap = new Map<string, string>();
Object.keys(types).forEach((key) => {
	const value = types[key];
	const last = key.split("/").at(-1);
	fsMap.set(`/${last}`, value);
});
fsMap.set("index.ts", "console.log(123)");
const system = createSystem(fsMap);
const env = createVirtualTypeScriptEnvironment(system, ["index.ts"], ts, compilerOptions);
export const Editor = () => {
	const [parent, setParent] = createSignal<HTMLDivElement>();
	createEffect(() => {
		const p = parent();
		if (!p) return;
		new EditorView({
			doc: "console.log('hello')\n",
			extensions: [
				typescript(),
				tsAutocompletion(env, "index.ts"),
				syntaxHighlighting(vsCodeDarkPlusHighlightStyle, { fallback: true }),
				typescriptHoverTooltip(env, "index.ts"),
				vsCodeDarkPlusTheme,
				basicSetup,
			],
			parent: p,
		});
	});
	return <div ref={setParent} style={{ "text-align": "left" }}></div>;
};
