import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		setupFiles: ["./test/setup.ts"],
		poolOptions: {
			forks: {
				// Node 25 以降は組み込みの localStorage が jsdom の実装を覆い隠す．
				// Node 26 では --localstorage-file 無しで触れると例外になるため，
				// テストのワーカーでは組み込みの Web Storage を無効にする．
				// Vitest 4 へ上げる際は test.execArgv へ移す．
				execArgv: ["--no-experimental-webstorage"],
			},
		},
	},
});
