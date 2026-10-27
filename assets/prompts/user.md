# digibib5-mcp — User Guide

Welcome! This guide teaches you, in plain language, how to use the
Digitale Bibliothek reader: your own CD-ROMs, browsable and searchable on
a modern PC. No accounts, no cloud, no keys — everything happens locally
with the discs you own. Each section ends with things you can literally
type; the assistant behind this guide knows the `digibib` tool and will
run the calls for you.

Conventions used below: a *volume* is one CD-ROM (for example `DB008`,
the Hoffmann volume, or `DB074`, the Wilhelm Busch volume). A *chapter* is
one entry of the table of contents. A *record* is one print page worth of
text with a number; chapters span many records, and every record number I
show you is clickable-back-to-the-disc in the sense that the assistant can
fetch exactly that record for verification.

## 1. Getting started in five minutes

First, make sure your discs are visible. The library lives wherever you
put it — by default the server looks at `K:\Digitale Bibliothek\Bibliothek`
(or the `DIGIBIB_ROOT` environment variable on other machines). Each
volume is a folder like `DB008` containing a `data` folder with files
named `TREE.DKI`, `TEXT.DKI`, `DIGIBIB.TXT`, and friends. If the reader
shows no volumes, the folder is wrong or the discs are not mounted: fix
the path, restart the backend (`stop.bat`, then `start.bat`), and reload.

Your first three moves:

1. **Ask what you own.** "What volumes do I have?" The assistant lists
   every disc with its id and title — `DB008` for Hoffmann, `DB074` for
   Busch, and everything else on your shelf. Memorize nothing; the ids are
   always one question away.
2. **Open a volume.** "Show me the table of contents of DB008." You get
   the nested tree: parts, works, essays about the author. For giant
   volumes like the 2,508-node Busch disc, ask for the top two levels
   first ("just the top-level sections"), then drill down — nobody wants
   2,500 lines pasted into chat.
3. **Read something.** "Read me Der Sandmann." The assistant finds the
   chapter, fetches its full extent (about sixty records for Sandmann,
   roughly 80 kilobytes of flowing German prose), and shows it with its
   record range so you always know exactly where you are.

That is the whole loop you will use ninety percent of the time: list,
browse, read. Everything below is refinement of that loop.

A note on what you are reading: the text is decoded from a 1990s tokenized
format and reflowed into paragraphs. Running heads, page numbers, and
print-layout line breaks are gone; hyphenated line splits are rejoined;
spaced dashes and quotes are preserved. It reads like a book, but it is
not character-exact to the print edition — when a quotation matters, ask
for the record numbers and check them against the disc.

## 2. Finding things: the table of contents is your map

The table of contents mirrors the printed volume: front matter, the works
themselves, then apparatus (essays, bibliographies, indexes). Learn to read
its shape and you will rarely need blind searching.

**Orient yourself first.** New to a disc? Ask: "What is in DB074? Give me
the top-level sections." You will get something like: an introduction, the
author section (life, timeline, portraits), the works (organized by genre
or period), then reference material. That one answer usually tells you
where to spend your evening.

**Search the tree before searching the text.** If you know the title —
"Where is Die Elixiere des Teufels?" — the TOC answers faster and more
precisely than full-text search, because titles match titles. Ask for the
match and its node number; the assistant can open it immediately.

**Use depth deliberately.** Giant trees are easier in slices: "Show me the
top two levels of DB074", then "expand the Werke section", then "what is
inside Nachtstücke?". Each answer stays readable, and you build a mental
map instead of drowning in 2,500 lines.

**Mind the apparatus.** The most useful parts of these discs are often not
the works but the scaffolding around them: the "Materialien zu Leben und
Werk" essays that open a volume, the Werkgeschichten, the bibliographies
with their item numbers (`i47`, `i51` — those are bibliography entry
numbers, keep them when you cite). If you are researching rather than
reading for pleasure, say so: "I am researching, not reading — what
secondary material does this volume have?"

**When there is no tree.** A few discs (DB012 is the known one) have no
node-to-record map, so chapters resolve to empty text. That is a property
of the disc, not a bug. In that case navigate by record number instead:
"read record 0", then "next", treating the volume as a long scroll. Ask the
assistant for the volume's record count first so you know how deep the
scroll goes.

## 3. Reading chapters well

A chapter is not a page — it is a span of records, sometimes sixty or
more. A few habits make long chapters pleasant.

**Start from the chapter, not from a record.** "Read Der Sandmann" gives
you the whole arc with its heading and record range
(`records #2071–2130`). "Read record 2071" gives you one page. Prefer the
chapter unless you are verifying a specific passage.

**Mind the truncation.** Chapters longer than about a hundred records (or
300,000 characters) are cut with a `truncated: true` flag — the volume
root always is. If you hit the cap, ask for the next slice explicitly:
"continue from record 2171". The assistant can fetch any record range on
demand, so a capped chapter is a pause, not a wall.

**Headings are signposts.** Chapter text preserves headings as blank-line
separated lines (`Erster Teil`, `Die dürre Heide`, `Vorwort`). When you
skim a long chapter, ask for its headings first: "list the headings in
this chapter" — the assistant can derive them from the flow.

**Follow the apparatus references.** Bibliographies cite works with item
numbers and short titles; essays name other chapters ("see the essay on
Kreisleriana"). Treat those as links: "open the Kreisleriana essay it just
mentioned". The assistant resolves titles through the TOC.

**Mind the language.** The texts keep historical spelling and the occasional
editorial bracket (`[Abb. 12]`, `[Erstdruck …]`). Read them as part of the
apparatus, not as typos. The `hoffw1`-style tokens (e.g. `hoffw1 «Meister
Floh»`) are work-reference keys from the scholarly apparatus — they tell
you which work an essay is discussing. And the `[Abb. N]`/`BWE1343a.png`
style tokens are figure references: ask to see them (see section 5).

## 4. Search like a scholar, not like Google

The `search` operation queries a full-text index built from the decoded
text, so hits always match what you see when you open the chapter. The
first search on a volume takes about ten seconds (the index builds once,
then lives in a local cache file); after that everything is instant. Learn
the query language and you will find things Google cannot, because Google
does not have these discs.

**Start with one distinctive word.** `Nathanael` beats "the main character
of the story" every time. Proper nouns, unusual compounds, and technical
terms are the best first queries. Report back what you found before
refining — one good hit with its chapter beats twenty unopened snippets.

**Combine deliberately.** The query language supports `AND`, `OR`, `NOT`,
exact `"phrases"`, and `prefix*` wildcards. Useful progressions look like
this. First: `Sandmann`. Too many hits? Narrow: `Sandmann AND Nathanael`.
Looking for a theme across works: `Doppelgänger OR Spiegelbild`. Excluding
noise: `Kreisler NOT Kreisleriana`. Hunting word families: `Traum*` finds
`Traum`, `Traumbild`, `traumhaft`, `träumen` (diacritics are folded, so
`Tur` finds `Tür` and `Hubner` finds `Hübner`).

**Mind historical spelling.** These are 19th-century texts in modern
editions, but names and some words vary: `bey` for `bei`, `Thal` for
`Tal`, double versus single consonants in proper names. When the modern
spelling draws a blank, ask for the historical variant explicitly — "try
bey instead of bei" — rather than concluding the passage is absent.

**Read snippets as addresses, not answers.** Each hit carries its chapter
title, its node index, and its record number plus a `«»`-marked snippet.
The snippet tells you *where* to read; the chapter (via `node_text` on the
hit's node) tells you the *answer*. Ask to open the best hit rather than
collecting ten snippets.

**When nothing matches.** A single failed query proves nothing. Reformulate
twice — fewer words, then a prefix, then a spelling variant — and if all
three fail, ask the assistant to state plainly which queries were tried.
Absence of evidence after three genuinely different queries is worth
reporting; absence after one is not.

**Two worked progressions.** Looking for the Sandmann's famous letter
opening: start `Nathanael`, confirm the chapter is *Der Sandmann* in the
*Werke* section, open it, and read from record 2071 ("Nathanael an
Lothar"). Looking for puppet imagery across Hoffmann: start `Olimpia`,
then `Autom*` (catches `Automat`, `automatisch`, `Automaten*`), then
`"Gliederm*"`, grouping hits by chapter to see which works the motif
runs through. Each step is one short question; let the answers steer the
next one.

## 5. Figures: the pictures are part of the text

Volumes carry illustrations — Busch without pictures is half the point —
referenced inline as bare file names (`0092.bmp`, `BWE1343a.png`) next to
captions like `[Abb. 12]`. The reader's chapter view collects them into a
figure strip; in chat, ask explicitly: "what figures does this chapter
reference?" then "show me BWE1343a".

Practical notes. Zoom levels differ by disc generation: older discs expose
levels 1–4 (thumbnail to near-full page), newer `images.lib` discs expose
levels 1–3. If the largest zoom is missing for a figure (DB008 lacks some
level-4 scans; some DB074 entries lack level 3), the server falls back to
the nearest smaller zoom and says which level it served — a smaller picture
beats a broken link, and the reported `level` keeps everyone honest. If a
volume has no image store at all, say so once and stop asking. Never
describe an illustration you have not fetched: fetch first (the assistant
does this through the figure URL), then describe what is actually there.

## 6. Records: the fine-grained layer

Most reading happens at chapter level, but records are the precise
currency of this collection: every quotation should carry a record number,
every mystery ("which record is this sentence from?") resolves to one.
Useful record-level moves: "read record 2131" (lands exactly), "what
chapter contains record 2075?" (the assistant maps it through the TOC
extents), "read records 2071 through 2080" (a custom slice across a
chapter boundary). The reader webapp has a "jump to #" box that does the
same thing visually.

One caution: records are print pages, so a sentence can straddle a record
boundary. If a passage looks cut off mid-sentence, the rest is one record
up or down — ask for the neighbors rather than assuming corruption.

## 7. Troubleshooting (the greatest hits)

**"No table of contents."** The volume picker works but the tree is empty.
Two causes. Either the disc genuinely lacks the mapping file (DB012-style:
chapter text is empty everywhere too) — navigate by record number instead.
Or the library path is stale — re-check `DIGIBIB_ROOT`, restart the
backend, reload. The health endpoint (`/api/health`) reports whether the
root exists.

**"No text for this node."** Same fork as above: unmapped disc (use
records) versus a stale or partial install (verify the volume's `data`
folder actually contains `TEXT.DKI`). A single empty chapter among full
ones is worth reporting as a bug with the volume id and node index.

**"It shows the wrong chapter."** This was a real bug class (fixed in
0.1.1/0.2.x): the node-to-record map had the wrong convention for some
discs. If you suspect it today, verify with the heading: the chapter's
first heading should match the TOC entry you clicked, and the record range
should sit inside the volume's record count. Quote the node index, the
record range shown, and the first heading when reporting.

**"The text has no paragraphs / everything runs together."** Older client
versions preserved print line-breaks as newlines. Current decoding reflows
into paragraphs; if you see 64-character ragged lines you are looking at
stale output — reload, and if it persists, report the volume and chapter.

**"Hyphenated fragments" (`Hoff- manns`).** Same answer: the current codec
re-joins line-split words across breaks (dropping the hyphen for lowercase
continuations, keeping it for uppercase ones like `Serapions-Bruder`, and
leaving spaced dashes alone). Stale clients show the fragments; current
ones do not.

**"First search is slow."** Expected, once per volume: the FTS index builds
by decoding the whole disc (~10 seconds for a large volume), then caches
in `data/search.db`. All later searches are instant. If *every* search is
slow, the cache file may not be writable — check the data directory.

**"Page headers inside chapter text."** Running heads (`Hoffmann-PW Bd.
2`, `rororo-Hoffmann`) are stripped by the codec. Seeing them means stale
output — reload and re-fetch the chapter.

**"Weird tokens" (`hoffw1`, `i47`, `0092.bmp`).** Not corruption: `hoffwN`
are work-reference keys, `iNN` are bibliography item numbers, and
`*.bmp`/`*.png` tokens are figure references (ask to see the figure).
`#q:…` source-path markers should never be visible — if you see one,
report the volume, chapter, and record number.

**"Figure 404s."** Some zooms genuinely do not exist (documented per
volume). The server falls back to a smaller zoom automatically; a 404 after
fallback means the index entry itself is missing — report it with the
figure name.

**"The reader shows nothing but the backend is up."** Check the topbar
health dot: red means the frontend cannot reach the backend (wrong port,
backend down, proxy misconfigured). The Vite dev server proxies `/api` to
`127.0.0.1:14115` — if you changed `DIGIBIB_API_PORT`, the proxy target
must match.

## 8. Example dialogues

**Finding a chapter.**
> You: *Where is Die Elixiere des Teufels?*
> Assistant: *In DB008, node 46 ("Die Elixiere des Teufels…"), starting at
> record 295. Want me to open it?*
> You: *Yes, and does it have figures?*
> Assistant: *(opens the chapter, lists 2 figure refs)* *It references
> 2 figures — shall I show them?*

**A research hunt.**
> You: *Find every mention of Olimpia.*
> Assistant: *(searches `Olimpia`, 14 hits in 3 chapters)* *All hits are in
> Der Sandmann (records 2071–2131) plus two in the Kreisleriana essays.
> Open the Sandmann chapter?*
> You: *Just the Kreisleriana ones.*
> Assistant: *(opens the specific extent, quotes with record numbers.)*

**A figure question.**
> You: *The chapter mentions BWE1343a — what is it?*
> Assistant: *(fetches the figure at the best available zoom)* *It is the
> illustration for the Vorwort page: [description of what is actually
> visible]. It is referenced from record 477.*

**A dead end, handled well.**
> You: *Search for "smartphone".*
> Assistant: *No hits for "smartphone". These are 19th-century texts — try
> a period term? If you tell me the concept (e.g. optical devices), I can
> suggest contemporary words like "Perspektiv" or "Brille".*

**A fidelity question.**
> You: *Is this quote character-exact?*
> Assistant: *No — decoded text is reflowed and headings/italics are not
> preserved. The passage is record 2131 in DB008; check it against the
> disc or print edition before citing.*

**A figure-heavy chapter.**
> You: *Read me the Bilddokumente chapter and list its figures.*
> Assistant: *(opens the chapter — 52 figure refs)* *It references 52
> figures, mostly portraits and facsimiles. The strip above the text shows
> thumbnails; tell me a number (e.g. BWE1340a) and I will open it full
> size and describe what is actually depicted.*

## 9. Connecting chat apps and the web reader

The same server powers three surfaces. **MCP clients** (Claude Desktop and
compatible hosts): add the stdio entry with `uv run digibib5-mcp`,
`PYTHONPATH` pointing at the repo's `src`, and `DIGIBIB_ROOT` at your
library — see INSTALL.md for the exact JSON block. **The web reader**
(`start.bat`, frontend 14114, backend 14115): pick a volume, expand the
tree, search from the sidebar, click figures in the chapter view. **Raw
REST** (`http://127.0.0.1:14115/api/…`): the endpoints mirror the MCP
operations one-to-one (`/toc`, `/node/{n}/text`, `/record/{n}/text`,
`/search?q=`, `/images`, `/image/{level}/{name}`), plus `/stats`, `/tools`
(a live introspection of the MCP surface), `/logs`, and the `/api/llm/*`
provider proxy that powers the reader's Chat page. A few calls worth
bookmarking:

- Health and library at a glance:
  `curl localhost:14115/api/health` and `curl localhost:14115/api/volumes`.
- Whole TOC as JSON for scripting:
  `curl "localhost:14115/api/volume/DB008/toc" | python -m json.tool`.
- Chapter text to a file:
  `curl "localhost:14115/api/volume/DB008/node/87/text" -o sandmann.json`.
- Search from the shell:
  `curl "localhost:14115/api/volume/DB008/search?q=Nathanael&limit=5"`.
- A figure straight to disk:
  `curl "localhost:14115/api/volume/DB008/image/1/0092.BMP" -o fig.png`.
- What can the MCP tool do right now:
  `curl localhost:14115/api/tools` (live schema, never stale docs).
- Recent backend log lines when something looks off:
  `curl "localhost:14115/api/logs?limit=50"`.

## 10. Frequently asked questions

**Do I need the CDs in the drive?** No — copied or imaged libraries work
identically, as long as the folder layout (`DBnnn\data\…`) is intact and
readable. Network shares work too if they are fast; the FTS build reads
the whole `TEXT.DKI` once.

**Which volumes work?** Any Digitale Bibliothek 5 data disc with the
standard files. DB008 (Hoffmann) and DB074 (Busch) are the verified
reference volumes; DB006 parses with the same newer-disc code path.
Report others that misbehave with volume id plus symptom.

**Can I search across all volumes at once?** Not in one call — search is
per volume (each disc builds its own index). Ask for the same query across
two or three named volumes and the assistant will run them one by one and
merge the answers by chapter.

**Are the texts complete?** They are the complete disc contents, including
front matter, apparatus, and indexes. What you see as chapters is what the
TOC maps; unmapped tail records (if any) are still reachable by record
number.

**Can I export a chapter?** Ask for the full text plus its record range;
the reader's chat has an export button, and the API returns plain JSON you
can save. Remember the reflow caveat for citations.

**Who do I tell about a decoding glitch?** File an issue with: volume id,
node index (or record number), the exact wrong text (a few words suffice),
and what you expected. The codec improves volume by volume from exactly
such reports — DB074's high-bit lengths and `.xml` markers were found
this way.

**Does this defeat copy protection?** There is none to defeat: the format
is undocumented but unprotected, and the tool only reads discs you own.
See the legal note in the README.

**How do I use the web reader?** Run `start.bat` (or `just webapp`),
open `http://127.0.0.1:14114`, pick a volume, expand the tree, and read.
The sidebar searches with chapter-context results; chapters show their
figure strips; "jump to #" reads raw records. The topbar search jumps
straight into the reader, and the topbar dot tells you whether the backend
is reachable.

**Can I back up or move the search index?** The index is
`data/search.db` next to the repo (or wherever `DIGIBIB_CACHE_DIR`
points). Copy it alongside your library to skip rebuilds; delete it to
force a clean rebuild after a codec update. It is keyed by file
modification time, so it refreshes itself when the disc image changes.

**Does it run on other machines?** The server is plain Python
(`fastmcp`, `pydantic`, `httpx`) plus `uv`; the reader is a Vite static
build. Point `DIGIBIB_ROOT` at a copied library folder on any Windows PC
and everything works — no installer, no registry, no admin rights.

## 11. Power workflows

Once the basics feel natural, these compound workflows get real research
done. Each is a sequence of short questions — let the answers steer you.

**Multi-volume motif tracking.** Pick the motif first in plain language
("mechanical humans", "dreams that come true", "letters as narrative
frame"), then ask for search terms: the assistant will propose period
vocabulary (`Automat`, `Maschine`, `Olimpia` for the first;
`Traumgesicht`, `Ahnung`, `Nachtstück` for the second; `Brief`, `schreibt`,
`Blatt` for the third). Run the best term per volume, collect the
chapters, then read only the strongest two hits per volume in full. Finish
by asking for a motif map: which chapters in which volumes, with record
numbers, grouped by work. This turns an afternoon of skimming into a
citable map.

**Figure-heavy reading (Busch especially).** Busch's stories are
picture-stories: the verses cue the drawings and the drawings carry gags
the verses skip. Read such a chapter with its figures open: open the
chapter, ask for its figure list, then walk them in record order ("show me
the figures for records 477 through 485"). When a verse names an action
that the text does not describe ("und schwupp, war er verschwunden"),
check the neighboring figure — the punchline is usually visual. If a
figure 404s at full size, step down a zoom rather than skipping it; the
level reported with each image tells you what you actually got.

**Record-level verification.** When a quotation matters (an essay, a
citation, a dispute about wording), drop from chapter view to record view:
ask which record contains the sentence (the assistant maps it through the
TOC extents or a phrase search), read that record plus its neighbors, and
record the triple of volume id, record number, and chapter title. That
triple is the stable address of any passage in this system — TOC indices
can shift if a disc is re-read, but record numbers are byte offsets into
the edition and do not move.

**Building a reading list.** Name a theme ("Hoffmann's musicians",
"Busch's pious frauds", "letters that lie") and ask for candidate chapters
across your volumes with one-line descriptions. The assistant searches
terms, checks TOC titles, and proposes a list with node indices — which
you then accept, cut, or reorder ("drop the essays, keep only stories").
Save the final list with record ranges; it becomes your syllabus, and each
entry opens with a single `node_text` call.

**Comparing editions and states.** Some works exist twice on one disc (a
Hörtext audio-book section versus the collected text, a first version
versus a revised one). Open both extents, compare openings and endings
first (where revisions cluster), then search within each for a distinctive
sentence from the other — absence is as informative as presence. Keep both
record ranges side by side in your notes.

**Apparatus-first research.** If your question is scholarly rather than
literary ("when was this written?", "what did contemporaries think?",
"which manuscript is the text based on?"), start from the back of the TOC,
not the front: Werkgeschichten, Zeittafeln, Sigel- und Konkordanzverzeichnisse,
bibliographies, and the "Materialien" essays up front. These sections are
dense with dates, names, and references — search them with years
(`"1815"`, `"1822"`) and surnames before touching the works themselves.

## 12. Glossary: the apparatus around the texts

These discs are scholarly editions, and their tables of contents assume you
know the vocabulary. The most common terms:

- **Werkgeschichte / Entstehungsgeschichte** — the genesis of a work: when
  and where it was written, manuscript situation, first publication.
- **Sigel und Konkordanz** — the key to the edition's sigla (abbreviation
  system) plus a concordance mapping pages or sections to other editions.
  Read this before citing anything by page.
- **Zeittafel** — chronological table of the author's life against the
  works. The fastest way to date an unfamiliar text.
- **Lesetext / Faksimile** — a clean reading text versus a facsimile
  reproduction (often noted per chapter; facsimile-heavy sections pair
  with figures).
- **Hörtext** — the audio-book section (professional readings; the text
  shown is the read text, audio itself lives on separate CDs and is not
  playable here — the refs like `hoffw41.wav` mark the spots).
- **Apparat / Anmerkungen / Kommentar** — notes, variants, and commentary,
  usually the longest and densest part of a volume. Search here for names
  and dates, not in the stories.
- **Werkverzeichnis / Bibliographie** — complete list of works / secondary
  literature, with the `iNN` item numbers you will see inline. Cite the
  item number together with the record number.
- **Abbildungen / Bilddokumente** — the figure sections (portraits,
  facsimiles, illustrations) that the `BWE…` / `0092.bmp`-style references
  point at.
- **Nachwort / Vorwort** — afterword / foreword, often the best short
  secondary text on a work: read it before the work itself if you are new
  to it.
- **Vermischtes / Anhang** — miscellany / appendix: fragments, letters,
  juvenilia. Worth a search pass for names that appear nowhere else.
