## Design Context

### Users
Homeowners use the dashboard to understand the state of their home, notice meaningful problems quickly, and control connected ESP32 devices without needing embedded-systems knowledge. Admin-only surfaces may expose deeper controls, but the primary experience should speak from the resident's point of view.

### Brand Personality
Calm, trustworthy, and quietly technical. The interface should make normal operation feel reassuring while giving urgent safety, security, and device failures unmistakable priority.

### Aesthetic Direction
Use the approved Arduino888 Glass direction: a restrained, tactile smart-home interface with the liquid-glass lens limited to the floating toolbar and translucent cards over a static wallpaper. Support both light and dark themes through the existing tokens. Avoid decorative glow, gradients in text, emoji, generic dashboard ornament, and raw machine-oriented copy.

### Design Principles
- Prioritize the homeowner's next decision; translate device events into plain, useful language.
- Keep routine information quiet and progressively disclosed so warnings and urgent events remain prominent.
- Use semantic color only for status: green for healthy, amber for warning, red for critical, and dusty blue for interaction.
- Reuse the existing Glass tokens and components; do not introduce one-off colors, radii, shadows, or typography.
- Preserve accessibility in both themes with visible focus, clear labels, responsive controls, and reduced visual noise.
