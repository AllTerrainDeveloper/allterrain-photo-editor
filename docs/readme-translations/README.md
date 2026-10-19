# Readme translations

Translations of `readme.txt` for the WordPress.org plugin directory, ready to import into the **Stable Readme** project on translate.wordpress.org.

| File | Locale | Directory |
|---|---|---|
| `es_ES.po` | Spanish (Spain) | es.wordpress.org |
| `de_DE.po` | German | de.wordpress.org |
| `fr_FR.po` | French (France) | fr.wordpress.org |
| `pt_BR.po` | Portuguese (Brazil) | br.wordpress.org |
| `it_IT.po` | Italian | it.wordpress.org |
| `ja.po` | Japanese | ja.wordpress.org |
| `tr_TR.po` | Turkish | tr.wordpress.org |

These files are not part of the plugin zip: `bin/ships.mjs` excludes `docs/`.

## What they cover

Each file has 76 strings: the plugin name, the short description, every header, paragraph and list item of the Description section, plus Installation, FAQ and screenshot captions. The changelog is not included.

The msgids follow WordPress.org's own readme parser and string extraction (`Readme\Parser` and `cli/i18n/class-readme-import.php`), so they match the strings translate.wordpress.org creates for this readme.

## Importing

1. Release the version that contains this `readme.txt`. translate.wordpress.org regenerates the Stable Readme strings from the stable tag.
2. Open `https://translate.wordpress.org/projects/wp-plugins/allterrain-photo-editor/stable-readme/<locale>/default/`. The locale slug is `es`, `de`, `fr`, `pt-br`, `it`, `ja` or `tr`.
3. Use **Import Translations** and upload the matching `.po` file. Imports from contributors land as suggestions. A Project Translation Editor (PTE) for the plugin, or the locale's General Translation Editor, approves them. Plugin committers can request PTE rights for their own plugin in the locale's Polyglots channel.
4. Have a native speaker review before approval. The editor's own labels ("Edit Photos", "Edit with AllTerrain Photo Editor", "Step back", "Light") have no translations yet, so most files keep them in English; if the plugin's interface is translated later, these should match it.

If `readme.txt` changes after this, update the matching strings before importing. Unchanged strings keep their translations, and changed ones import as fuzzy or are skipped.
