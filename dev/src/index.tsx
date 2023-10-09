/* @refresh reload */
import type { Component } from "solid-js";
import { render } from "solid-js/web";
import { Editor } from "./components/Editor";
import "./index.css";

const App: Component = () => {
	return (
		<div class="App">
			<h1>CodeMirror TS Demo</h1>
			<Editor />
		</div>
	);
};

render(() => <App />, document.getElementById("root")!);
