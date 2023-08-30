import type { Component } from "solid-js";

import logo from "./logo.svg";
import styles from "./App.module.css";
import { createSystem, createVirtualTypeScriptEnvironment, type VirtualTypeScriptEnvironment } from "@typescript/vfs";
import ts from "typescript";
import { tsAutocompletion } from "../../src";
const fsMap = new Map<string, string>();
fsMap.set("index.ts", 'const a = "Hello World"');
const system = createSystem(fsMap);
const env = createVirtualTypeScriptEnvironment(system, ["index.ts"], ts, {});

const App: Component = () => {
	return (
		<div class={styles.App}>
			<header class={styles.header}>
				<img src={logo} class={styles.logo} alt="logo" />
				<p>
					Edit <code>src/App.tsx</code> and save to reload.
				</p>
				<a class={styles.link} href="https://github.com/solidjs/solid" target="_blank" rel="noopener noreferrer">
					Learn Solid
				</a>
			</header>
		</div>
	);
};

export default App;
