import { createRequire } from "node:module";

// Vitest's ESM interop awaits thenable modules, and OpenCV.js's emscripten
// module has a `then` that breaks that. Wrapping it keeps it from being awaited
const require = createRequire(import.meta.url);
export default { wrapped: require("@techstark/opencv-js") };
