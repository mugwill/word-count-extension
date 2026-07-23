# Privacy Policy — Auto Word Count for Google Docs

_Last updated: 2026-07-22_

## Summary

**This extension collects nothing.** It has no servers, makes no network requests, and
stores no personal data.

## What the extension does

The extension runs a single content script on Google Docs document pages
(`https://docs.google.com/document/*`). Its only function is to switch on Google Docs'
own built-in **"Display word count while typing"** setting by interacting with the Google
Docs menu and dialog, exactly as a user would by hand.

## Data collection

- **No personal or sensitive user data is collected**, transmitted, or sold.
- **No document content is read, stored, or transmitted.** The extension does not and
  cannot read the text of your documents (Google Docs renders document text to a canvas,
  not the page DOM).
- **No analytics, tracking, cookies, or third-party services** are used.
- **No remote code** is loaded or executed.

## Permissions

The extension requests **no special permissions**. It only runs on
`docs.google.com/document/*` pages via its content script, which is required solely to
locate and enable the native word-count toggle.

## Contact

For questions about this policy, open an issue on the project's GitHub repository:
<https://github.com/mugwill/word-count-extension>
