export function collectRendererScriptUrls(frameTree) {
  const urls = new Set();
  const visit = (tree) => {
    for (const resource of tree?.resources ?? []) {
      if (resource.type !== "Script") continue;
      try {
        const url = new URL(resource.url);
        if (url.protocol === "app:" && url.pathname.startsWith("/assets/") &&
            url.pathname.endsWith(".js")) {
          urls.add(url.href);
        }
      } catch {}
    }
    for (const child of tree?.childFrames ?? []) visit(child);
  };
  visit(frameTree);
  return [...urls];
}

export function rendererResourceUrls() {
  return [...new Set([
    ...(globalThis[Symbol.for("codex-keyboard-renderer-resource-urls")] ?? []),
    ...[...document.querySelectorAll("link[href],script[src]")]
      .map((element) => element.href || element.src),
    ...performance.getEntriesByType("resource").map((entry) => entry.name)
  ])].filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "app:" && url.pathname.startsWith("/assets/") &&
        url.pathname.endsWith(".js");
    } catch {
      return false;
    }
  });
}

export async function resolveRspackRuntime({ urls, importNamespace }) {
  const cached = globalThis[Symbol.for("codex-keyboard-rspack-runtime")];
  if (typeof cached === "function" && cached.m && cached.c) return cached;
  for (const url of urls.filter((candidate) =>
    candidate.startsWith("app://") && candidate.includes("/assets/") &&
    !candidate.includes("/async/")).slice(0, 20)) {
    try {
      const candidate = (await importNamespace(url)).__webpack_require__;
      if (typeof candidate === "function" && candidate.m && candidate.c) {
        globalThis[Symbol.for("codex-keyboard-rspack-runtime")] = candidate;
        return candidate;
      }
    } catch {}
  }
  return null;
}

export function rspackSlotResolvers(runtime) {
  if (!runtime?.c || !runtime?.m) return [];
  const resolvers = [];
  for (const [id, module] of Object.entries(runtime.c)) {
    const source = runtime.m[id];
    if (typeof source !== "function" || !source.toString().includes("slots")) continue;
    try {
      for (const candidate of Object.values(module.exports ?? {})) {
        if (candidate && typeof candidate === "object" &&
            typeof candidate.resolve === "function" &&
            typeof candidate.createSubscriberAtom === "function") {
          resolvers.push(candidate);
        }
      }
    } catch {}
  }
  return resolvers;
}

export async function resolveMicroBus({ cachedBus, urls, importNamespace, rspackRuntime = null }) {
  const isBus = (candidate) => Boolean(
    candidate && typeof candidate === "object" &&
    candidate.handlers instanceof Map &&
    (typeof candidate.dispatchHostMessage === "function" ||
      typeof candidate.dispatchMessage === "function")
  );
  if (isBus(cachedBus)) return cachedBus;
  for (const url of [...new Set(urls)]
    .filter((candidate) => /vscode-api|codex-micro|app-initial|app-shared/.test(candidate))
    .slice(0, 120)) {
    try {
      const namespace = await importNamespace(url);
      const bus = Object.values(namespace).find(isBus);
      if (bus) return bus;
    } catch {}
  }
  if (rspackRuntime?.c) {
    for (const module of Object.values(rspackRuntime.c)) {
      try {
        const bus = Object.values(module.exports ?? {}).find(isBus);
        if (bus) return bus;
      } catch {}
    }
  }
  return null;
}

export function readSignalValue(node, resolver, contextMap) {
  const resolved = resolver.resolve(node, contextMap);
  const value = node.store.get(resolved?.atom ?? resolved);
  return Array.isArray(value) ? value : value?.slots;
}
