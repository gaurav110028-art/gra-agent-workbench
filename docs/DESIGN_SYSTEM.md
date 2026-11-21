# GRA Workbench interface guidelines

## Operational screens

Use the Workbench font, theme tokens, logo, icons and destination links. Keep page chrome quiet. The module name belongs in the header and the active task is the page’s main visual heading. Use the theme accent for navigation and focus, a high-contrast solid button for the primary action and status colours only alongside written outcomes.

Use a four-pixel spacing rhythm. Align lists, forms and table headers to a common inset. Show essential status in the row. Use tabular figures for counts, telephone numbers, dates and times. Put units and UTC next to the value. Let names wrap. Keep long identifiers and wide operational tables inside their own scroll area.

## WhatsApp Manager decisions

| Before | After | Reason |
|---|---|---|
| Six outlined metric cards and a seven-day chart came before the work queue | One clickable strip of six sample totals, then upcoming reminders, campaign activity and recent attempts | The next eligible contact and latest failure fit in the desktop overview. |
| The mobile sidebar consumed space even when collapsed | A Workbench navigation disclosure above the module, horizontally scrollable section navigation and stacked name/phone cells | Consent, selection and contact editing remain available at 390px. |
| Editors opened below long lists | Named native dialogs, field-associated errors, keyboard dismissal and focus return | Administrators can finish an edit without losing their place. |
| Campaign creation displayed all controls at once | Template, Recipients, Personalization and Review, with Back preserving input | Required values are checked where they can be corrected. |
| Provider settings and sample results used similar badges | Integration settings identify each disconnected dependency; attempt rows identify the result and failure reason | A sample submission cannot be mistaken for a configured provider. |

Use native inputs, visible labels, immediate keyboard focus and text feedback. Group destructive controls with a confirmation. Use actual file-reading feedback during CSV preview. Keep routine actions immediate, honor reduced motion and avoid hover-only commands. Search the entire contact directory and paginate the resulting list. Bulk selection applies to eligible rows on the visible page.

## Data and access

The designated server-authenticated administrator opens the manager. The browser holds synthetic records in React state. Only the Workbench theme preference uses local storage. Approved languages and message bodies stay unconfirmed until supplied. A PDF URL is validated as text. No provider request verifies its contents. The reminder clock advances from every simulated attempt, including failures.

## Review practice

Compare all seven screens in both themes at 1440, 1280, 768 and 390 pixels. Check long and multilingual names, empty results, missing variables, a 500-row synthetic import, focus return, errors and disabled actions. Test the existing login, authorization, public simulation and Redactor flows against the local production build.

The Phase 2A.1 review used the upstream skill files directly. Hallmark's existing-design workflow supplied the before/after and wiring checks. Emil and Jakub informed pressure-testing and interaction feedback. Ibelick informed control names, focus and dialog behavior. Cloudflare's focused guidance was used to trace server authorization, private data access and rendering sinks. The protected route was rendered with authenticated local Playwright sessions. Static sloplint checked temporary JSX-named copies of the Next.js components and route CSS.

Dense tables retain 12–13px secondary text, consistent native control outlines and complete field labels. Marketing-page word limits, hero imagery, globally clipping horizontal overflow and changing the project's CSS stack do not serve this interface.

- [Hallmark redesign workflow](https://github.com/nutlope/hallmark/blob/04977e15f3dfd6ee4b74c887dac3eb52665d6c92/skills/hallmark/references/redesign.md)
- [Emil's design engineering](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/emil-design-eng/SKILL.md) and [break-ui](https://github.com/emilkowalski/skills/blob/64eb3deb9a5fbfa041faf783e0bc3fd635872e9c/skills/break-ui/SKILL.md)
- [Make interfaces feel better](https://github.com/jakubkrehel/make-interfaces-feel-better/blob/6d9f2f1df10e8ce2ae1708598a73b0506fb98794/skills/make-interfaces-feel-better/SKILL.md)
- [Baseline UI](https://github.com/ibelick/ui-skills/blob/347d3189830f8ec3c4c041421bce19182a79dc7a/skills/baseline-ui/SKILL.md) and [accessibility](https://github.com/ibelick/ui-skills/blob/347d3189830f8ec3c4c041421bce19182a79dc7a/skills/fixing-accessibility/SKILL.md)
- [Cloudflare security audit guidance](https://github.com/cloudflare/security-audit-skill/blob/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8/skills/security-audit/SKILL.md)
