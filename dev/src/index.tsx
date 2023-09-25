/* @refresh reload */
import type { Component } from "solid-js";
import { render } from "solid-js/web";
import { Editor } from "./components/Editor";
import styles from "./App.module.css";
import "./index.css";

const App: Component = () => {
	return (
		<div class={styles.App}>
			<Editor />
		</div>
	);
};

render(() => <App />, document.getElementById("root")!);
