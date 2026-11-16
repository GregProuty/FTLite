// TEST ONLY. Exact single-site substitutions add observation calls to the built
// authority; every original permission decision and result remains unchanged.
module.exports = function instrument(source) {
  function once(needle,replacement) {
    if(source.split(needle).length!==2) throw Error('instrumentation-source-mismatch');
    source=source.replace(needle,replacement);
  }
  once('function permitted(allowBootstrap = false) {','function permitted(allowBootstrap = false, observedBoundary = "control") {');
  once('let allowed = false;\n    try {\n      allowed = deps.sessionGate.check().allowed === true;',
    'const observedCheckMs = performance.now();\n    let allowed = false;\n    try {\n      allowed = deps.sessionGate.check().allowed === true;');
  once('    if (!allowed) {\n      if (!fenced)',
    '    globalThis.__recoveryPermission?.({ boundary: observedBoundary, allowed, atMs: observedCheckMs, tick: state.tick });\n    if (!allowed) {\n      if (!fenced)');
  once('    return permitted();\n  });','    return permitted(false, "tick");\n  });');
  once('            if (!permitted()) {\n              rejectIngress(binding, message);',
    '            if (!permitted(false, "ingress")) {\n              rejectIngress(binding, message);');
  return source;
};
