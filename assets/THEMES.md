# Published-game appearance

`theme.js` runs synchronously in each published page's head, before styles. With no saved preference, the page follows `prefers-color-scheme`, including changes while open. Automatic startup and OS changes do not write a theme override.

The **Theme** selector offers **System**, **Light**, and **Dark**. An explicit choice is saved as `puzzle-theme-v1` and synchronised across same-origin tabs. Choosing System remembers the mode, not the system's current colour. If storage is blocked, the choice still works in the current tab. Native form controls receive the matching `color-scheme` before the first paint.

Existing valid crossword/Connections `xw-theme` and local Scattergories `inverted` choices are migrated when those pages are first visited, without altering legacy keys or other game settings. Older versions also saved defaults, which cannot be distinguished from deliberate choices: select **System** once to resume OS-following in that case.

Included: the home and crossword launchers; all three crossword sources; Connections; Flags; TLDs; Deadlock Guess Who; the Scattergories launcher and local backup; and both Jeopardy pages. The audience display shares the control panel's choice without placing controls over the presentation. External linked sites are not restyled. Unpublished games do not load these assets.

`theme.css` provides shared control/shell tokens and light treatments for older dark-only game surfaces. Semantic game artwork is retained: flags, Connections category colours, Deadlock portraits/elimination marks, and Jeopardy's blue/gold board. Jeopardy's explicit blackout screen remains black in both themes.

## Crossword phone/tablet input

Tapping a cell or clue focuses a real text input (`inputmode="text"`, `enterkeyhint="next"`) during the user gesture. The device supplies the keyboard; there is no custom letter-key dock or reserved dock spacing. Previous/next clue and direction buttons are inline with the board.

The input handles browser text, deletion without useful keydown events, and composed text. A zero-width buffer character allows repeated native Backspace. Selection follows the active cell. On phone layouts, viewport changes scroll that cell into view when necessary without compressing the board to the keyboard's height. Blurring never forcibly reopens the keyboard. Desktop hardware-key navigation remains available.

See `../tests/README.md` for browser checks and physical-device verification limitations.
