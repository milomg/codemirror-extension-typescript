import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	target: "esnext",
	format: ["esm", "cjs"],
	sourcemap: true,
	clean: true,
	dts: true,
});
