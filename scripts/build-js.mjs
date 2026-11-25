import { rollup } from "rollup";
import config from "../rollup.config.mjs";

const bundle = await rollup({
  input: config.input,
  plugins: config.plugins
});

try {
  await bundle.write(config.output);
  console.log(`Built ${config.output.file}`);
} finally {
  await bundle.close();
}

process.exit(0);
