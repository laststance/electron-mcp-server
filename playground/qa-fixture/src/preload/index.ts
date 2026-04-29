// Intentionally minimal: the fixture validates renderer-side MCP tool surfaces
// (DOM, storage, drag, etc.) which all work without any preload bridge.
// Keeping the preload empty ensures the unsafe-mode reproduction of Issue #9
// is not muddied by extra IPC plumbing.
export {}
