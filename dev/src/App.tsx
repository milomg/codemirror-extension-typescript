import type { Component } from "solid-js";

import logo from "./logo.svg";
import styles from "./App.module.css";
import { Editor } from "./components/Editor";
const App: Component = () => {
	return (
		<div class={styles.App}>
			<Editor />
		</div>
	);
};

export default App;
