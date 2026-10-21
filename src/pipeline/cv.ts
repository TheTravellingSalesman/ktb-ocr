import cvModule from "@techstark/opencv-js";

/** The OpenCV.js module object, typed loosely because its bindings are generated */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CV = any;

let loading: Promise<CV> | null = null;

/**
 * Load OpenCV.js once and return the ready module.
 *
 * The package exports either a promise or a module that becomes ready later,
 * depending on the build. The runtime can also finish initializing before a
 * callback is attached, so readiness is polled as well.
 */
export function loadCv(): Promise<CV> {
  loading ??= (async () => {
    // Tests load the module through a wrapper. See tests/helpers/opencv-node.ts
    const imported = cvModule as unknown as CV;
    const mod = imported.wrapped ?? imported;
    if (mod instanceof Promise) return await mod;
    if (!mod.Mat) {
      await new Promise<void>((resolve) => {
        const previous = mod.onRuntimeInitialized;
        mod.onRuntimeInitialized = () => {
          previous?.();
          resolve();
        };
        const poll = setInterval(() => {
          if (mod.Mat) {
            clearInterval(poll);
            resolve();
          }
        }, 20);
      });
    }
    // The module is thenable. Returning it from an async function would unwrap it forever
    return { cv: mod }.cv;
  })().then((cv) => {
    if (typeof cv.then === "function") delete cv.then;
    return cv;
  });
  return loading;
}
