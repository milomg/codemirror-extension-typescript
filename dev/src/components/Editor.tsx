import { createDefaultMapFromNodeModules, createSystem, createVirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts from "typescript";
import { tsAutocompletion } from "../../../src";
import { basicSetup, EditorView } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { createEffect, createSignal } from "solid-js";
// const getLib = (name: string) => {
// 	const lib = dirname(require.resolve("typescript"));
// 	return readFileSync(join(lib, name), "utf8");
// };

// const addLib = (name: string, map: Map<string, string>) => {
// 	map.set("/" + name, getLib(name));
// };

// const createDefaultMap2015 = () => {
// 	const fsMap = new Map<string, string>();
// 	addLib("lib.es2015.d.ts", fsMap);
// 	addLib("lib.es2015.collection.d.ts", fsMap);
// 	addLib("lib.es2015.core.d.ts", fsMap);
// 	addLib("lib.es2015.generator.d.ts", fsMap);
// 	addLib("lib.es2015.iterable.d.ts", fsMap);
// 	addLib("lib.es2015.promise.d.ts", fsMap);
// 	addLib("lib.es2015.proxy.d.ts", fsMap);
// 	addLib("lib.es2015.reflect.d.ts", fsMap);
// 	addLib("lib.es2015.symbol.d.ts", fsMap);
// 	addLib("lib.es2015.symbol.wellknown.d.ts", fsMap);
// 	addLib("lib.es5.d.ts", fsMap);
// 	return fsMap;
// };
const types = import.meta.glob("../../../node_modules/typescript/lib/{lib.es2015,lib.d}*", {
	eager: true,
	as: "raw",
});

const fsMap = new Map<string, string>();
Object.keys(types).forEach((key) => {
	const value = types[key];
	const last = key.split("/").at(-1);
	fsMap.set(`/${last}`, value);
});
console.log(fsMap);
const system = createSystem(fsMap);
const env = createVirtualTypeScriptEnvironment(system, ["index.ts"], ts, {});
export const Editor = () => {
	const [parent, setParent] = createSignal<HTMLDivElement>();
	createEffect(() => {
		const p = parent();
		if (!p) return;
		new EditorView({
			doc: "console.log('hello')\n",
			extensions: [basicSetup, javascript()],
			parent: p,
		});
	});
	return <div ref={setParent}></div>;
};
