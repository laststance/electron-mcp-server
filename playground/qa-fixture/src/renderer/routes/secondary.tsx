export function Secondary() {
  return (
    <div className="section" data-testid="secondary-section">
      <h2>Secondary Window Route</h2>
      <p>
        This route is the default landing page for windows opened via{' '}
        <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>N</kbd>. Use it to verify multi-window MCP scenarios:
      </p>
      <ul>
        <li>
          <code>list_electron_windows</code> should report 2 entries when both primary and
          secondary windows are open.
        </li>
        <li>
          <code>get_electron_window_info</code> with this window's <code>targetId</code> should
          return a title that ends in <em>Secondary</em>.
        </li>
        <li>
          Tools that take both <code>targetId</code> and <code>windowTitle</code> should prefer the
          <code>targetId</code> argument when both are supplied (precedence test).
        </li>
      </ul>
      <p data-testid="secondary-marker">SECONDARY_WINDOW_MARKER</p>
    </div>
  )
}
