# KANJIDIC2 data license

`data/kanji.json`, and the copy of it embedded in the built `main.js`, is derived from
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), the property of the
[Electronic Dictionary Research and Development Group](https://www.edrdg.org/) (EDRDG).
It is used in conformance with the Group's [licence](https://www.edrdg.org/edrdg/licence.html).

The data is licensed under the
[Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0).

Changes made: the data was reduced to Jōyō kanji and kanji with a JLPT level, and only
readings, Korean readings, meanings (English, French, Spanish, Portuguese), stroke count,
grade and JLPT level were kept, converted to JSON by `tools/build_kanji.py`.

The plugin's own source code is licensed separately under the MIT License (see `LICENSE`).
