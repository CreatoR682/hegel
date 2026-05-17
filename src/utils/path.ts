/**
 * Normalize a Cursor-supplied workspace path to a platform-native format.
 *
 * On Windows, Cursor passes Unix-style paths like "/c:/Projects/Foo" in the
 * hook payload's `workspace_roots`. When these flow into Node fs APIs
 * (especially `mkdir`), the leading "/" is interpreted as "root of the
 * current drive", producing malformed paths like "C:\c:\Projects\Foo"
 * (double drive letter) which then fail with ENOENT.
 *
 * Strip the leading "/" when the path matches `/<letter>:/...`. Non-Windows
 * platforms and paths that aren't in this specific shape pass through
 * unchanged.
 */
export function normalizeWorkspacePath(p: string): string {
  if (process.platform === "win32" && /^\/[a-zA-Z]:/.test(p)) {
    return p.substring(1);
  }
  return p;
}
