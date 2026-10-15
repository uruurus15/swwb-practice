// WebAssembly 版エンジンの呼び出し。JSON を渡して JSON を受け取る（wasm/src/lib.rs）。
(function (root) {
  let ex = null;
  const enc = new TextEncoder(), dec = new TextDecoder();

  async function initEngine(source) {
    const bytes = source instanceof ArrayBuffer || ArrayBuffer.isView(source) ? source : await (await fetch(source)).arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    ex = instance.exports;
    return call({ op: 'ping' });
  }

  function call(obj) {
    const b = enc.encode(JSON.stringify(obj));
    const p = ex.alloc(b.length);
    new Uint8Array(ex.memory.buffer, p, b.length).set(b);
    const o = ex.call(p, b.length);
    ex.dealloc(p, b.length);
    const len = new DataView(ex.memory.buffer).getUint32(o, true);
    const s = dec.decode(new Uint8Array(ex.memory.buffer, o + 4, len));
    ex.dealloc(o, 4 + len);
    const j = JSON.parse(s);
    if (j && !Array.isArray(j) && j.error) throw new Error(j.error);
    return j;
  }

  root.SWWB = { initEngine, call };
  if (typeof module !== 'undefined') module.exports = root.SWWB;
})(typeof window !== 'undefined' ? window : globalThis);
