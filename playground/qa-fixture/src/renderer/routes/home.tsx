export function Home() {
  return (
    <div className="section" data-testid="home-section">
      <h2>QA Fixture — Home</h2>
      <p>
        Choose a route from the navigation above. Each route exercises a slice of MCP tooling that
        is hard to reproduce in the main <code>skills-desktop</code> QA target.
      </p>
      <ul>
        <li><strong>Forms</strong> — radio / checkbox / select / file inputs for <code>verify_form_state</code>, <code>select_option</code>.</li>
        <li><strong>Drag &amp; Drop</strong> — HTML5 native DnD for <code>drag_from_to</code>.</li>
        <li><strong>Scroll</strong> — 3000×3000 inner area for <code>scroll_*</code> tools.</li>
        <li><strong>Hover</strong> — tooltip targets for <code>hover_by_*</code>.</li>
        <li><strong>Storage</strong> — local / session storage UI.</li>
        <li><strong>Context Menu</strong> — custom right-click menu.</li>
        <li><strong>Secondary</strong> — open a 2nd window with <kbd>Cmd</kbd>+<kbd>N</kbd>.</li>
      </ul>
    </div>
  )
}
