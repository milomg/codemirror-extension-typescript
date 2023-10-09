import { createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts, { CompilerOptions, JsxEmit, ModuleKind, ModuleResolutionKind, ScriptTarget } from "typescript";
import { paramTooltip, tsAutocompletion, tsLinting, typescript, typescriptHoverTooltip } from "../../../../src";
import { basicSetup, EditorView } from "codemirror";

import { vsCodeDarkPlusTheme, vsCodeDarkPlusHighlightStyle } from "./vs-code-dark-plus";
import { codeFolding, syntaxHighlighting } from "@codemirror/language";

const types = import.meta.glob("../../../../node_modules/typescript/lib/*", {
	eager: true,
	as: "raw",
});
const solidTypes = import.meta.glob("../../../../node_modules/{solid-js,csstype}/**/*.{d.ts,json}", {
	eager: true,
	as: "raw",
});

const compilerOptions: CompilerOptions = {
	strict: true,
	target: ScriptTarget.ESNext,
	module: ModuleKind.ESNext,
	jsx: JsxEmit.Preserve,
	jsxImportSource: "solid-js",
	moduleResolution: ModuleResolutionKind.Node10,
	allowNonTsExtensions: true,
};
const fsMap = new Map<string, string>();
Object.keys(types).forEach((key) => {
	const value = types[key];
	const last = key.split("/").at(-1);
	fsMap.set(`/${last}`, value);
});
Object.keys(solidTypes).forEach((key) => {
	const value = solidTypes[key];
	fsMap.set(`file://${key.slice(11)}`, value);
});

const file = `import { render } from "solid-js/web";
import { createSignal } from "solid-js";

function Counter() {
  const [count, setCount] = createSignal(1);
  const increment = () => setCount(count() + 1);

  return (
    <button type="button" onClick={increment}>
      {count()}
    </button>
  );
}

render(() => <Counter />, document.getElementById("app")!);
`;
fsMap.set("file:///index.tsx", file);

const system = createSystem(fsMap);
export const Editor = () => {
	const env = createVirtualTypeScriptEnvironment(system, ["file:///index.tsx"], ts, compilerOptions);
	const editor = new EditorView({
		doc: file,
		extensions: [
			typescript({ jsx: true }),
			codeFolding(),
			tsAutocompletion(env, "file:///index.tsx"),
			syntaxHighlighting(vsCodeDarkPlusHighlightStyle, { fallback: true }),
			typescriptHoverTooltip(env, "file:///index.tsx", vsCodeDarkPlusHighlightStyle),
			tsLinting(env, "file:///index.tsx"),
			paramTooltip(env, "file:///index.tsx"),
			vsCodeDarkPlusTheme,
			basicSetup,
			EditorView.updateListener.of((update) => {
				if (update.docChanged) {
					env.updateFile("file:///index.tsx", update.state.doc.toString() + "\n");
				}
			}),
		],
	});

	return <>{editor.dom}</>;
};
