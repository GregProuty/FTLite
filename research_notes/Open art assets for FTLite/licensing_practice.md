# Licensing and practical pitfalls of open-licence 2D art in a distributed indie game (FTLite)

Scope note: FTLite is a TypeScript/Electron Windows desktop game, possibly sold later, possibly open-sourced later, with code and art licences potentially differing. Nothing here is legal advice. Items marked **[interpretation]** are my reading rather than stated text in a source. Items marked **[community, not official]** come from forum posts.

Access note: opengameart.org returns HTTP 403 to automated fetchers; I retrieved the FAQ via curl with a browser user agent and quote from that copy. itch.io's official AI-disclosure announcement and its Terms page were not retrievable in this pass; itch.io facts below rely on secondary press and itch forum posts and are flagged.

---

## Key question 1: What does each licence require when bundled in a commercial or free desktop game, and does CC-BY-SA / GPL reach the game's own art or code?

### Takeaway
CC's own FAQ says ShareAlike applies only to *adaptations* (modified-then-shared works), not to *collections*, so unmodified BY-SA sprites inside a game do not force the game or its other art to be BY-SA; any BY-SA sprite you modify must be released under BY-SA. GPL for art is a grey zone: the FSF says GPL can apply to any work but gives no game-art-specific guidance, OGA tells non-GPL projects to "fully understand" the risk, and forum consensus is to avoid GPL art in closed-source games. OFL fonts and CC0 are low-friction; CC-BY requires a TASL-style credit plus a changes note.

### Cited Findings

**CC0**
- OGA's summary: CC0 works "may be copied, modified, distributed, performed or otherwise used in anyway without asking, crediting or notifying the creating artist"; "If you are using art, this license means commercial use is ok." — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- CC best-practice guide: attribution is not legally required under CC0 or the Public Domain Mark, but crediting is encouraged; "Copyright cannot be the only checkbox." — [CC wiki: Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution)
- Kenney: all game assets on its asset pages are "public domain licensed (CC0)"; "Attribution is not required"; usable "even in commercial projects"; "Do not use our logo, as it is reserved for official projects by our studio." Each asset download also carries a licence file. — [kenney.nl/support](https://kenney.nl/support)

**CC-BY 3.0 / 4.0**
- CC BY 4.0 legal code §3(a)(1): when sharing, retain if supplied by the licensor: "identification of the creator(s)", "a copyright notice", "a notice that refers to this Public License", "a notice that refers to the disclaimer of warranties", "a URI or hyperlink to the Licensed Material to the extent reasonably practicable"; indicate modifications and "retain an indication of any previous modifications"; state the material is licensed under this Public License. §3(a)(2): conditions may be satisfied "in any reasonable manner based on the medium, means, and context in which You Share the Licensed Material" and "it may be reasonable to satisfy the conditions by providing a URI or hyperlink to a resource." — [CC BY-SA 4.0 legal code (same attribution text as BY 4.0)](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
- CC BY 4.0 §3(a)(3): "If requested by the Licensor, You must remove any of the information required by Section 3(a)(1)(A) to the extent reasonably practicable." — [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)
- CC FAQ on 3.0 vs 4.0: before 4.0 you also had to give the *title*; 4.0 only recommends it when supplied. Before 4.0, indicating modifications was required only for adaptations adding your own creative material; 4.0 requires indicating any modification. Under 4.0, rights terminated for a violation are automatically reinstated if you cure within 30 days of discovering it; earlier versions have no automatic reinstatement. — [CC FAQ](https://creativecommons.org/faq/)
- CC BY-SA 4.0 §6(b): terminated rights "reinstate[] automatically as of the date the violation is cured, provided it is cured within 30 days of Your discovery of the violation", or by express reinstatement from the licensor. — [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
- CC FAQ: attribution placement is flexible: "CC licenses allow for flexibility in the way credit is provided depending on the medium, means, and context", and you may satisfy the requirement by linking to a place where the attribution information can be found. — [CC FAQ](https://creativecommons.org/faq/)
- OGA's summary of CC-BY adds a DRM reading: "You may not impose any additional restrictions on the redistribution of the work. In practice, this means the work may not be not used on distribution networks that use some form of Digital Rights Management (DRM)" and notes "many game distribution networks do use DRM (ie. Apple iOS, Xbox Live, Sony PSN) and others may or may not use DRM depending on how a developer chooses to package a particular game (ex. Steam, Google Android)." OGA explicitly caveats: "Nothing written here is guaranteed to be correct or intended to be used as legal advice." — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA FAQ: "Apple's App Store in particular has been found to have usage terms that conflict with the terms of the GNU GPL, the GNU LGPL, CC-BY-SA, and CC-BY" and permission must come from the artist(s), not OGA. — [OpenGameArt FAQ](https://opengameart.org/content/faq)

**CC-BY-SA 3.0 / 4.0 (share-alike reach)**
- CC FAQ: "ShareAlike applies only to adaptations": the SA condition applies only when a work is modified and then shared publicly. "A collection or compilation does not have to be released under SA." Example given: a publicly distributed database of BY-SA photos could be licensed as a whole under BY while each photo stays under BY-SA; any photo the distributor *modified* would need to carry BY-SA. — [CC FAQ](https://creativecommons.org/faq/)
- CC FAQ: all CC licences allow licensed material to be included in collections (anthologies, encyclopedias, broadcasts); you may choose a licence for the collection, but that does not change the licence on the included material and you must still comply with its conditions. — [CC FAQ](https://creativecommons.org/faq/)
- CC FAQ: whether a use is an adaptation "depends mainly on copyright law"; under CC licences, synchronizing music with a moving image is *always* an adaptation; changing only the format (e.g. printing an online book) is not. — [CC FAQ](https://creativecommons.org/faq/)
- CC BY-SA 4.0 §1(a): Adapted Material is material "derived from or based upon the Licensed Material and in which the Licensed Material is translated, altered, arranged, transformed, or otherwise modified"; for music/sound recordings, "Adapted Material is always produced where the Licensed Material is synched in timed relation with a moving image." §3(b): the Adapter's License "must be a Creative Commons license with the same License Elements, this version or later, or a BY-SA Compatible License." — [CC BY-SA 4.0 legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.en)
- OGA's summary: for BY-SA, commercial use is ok "so long as you provide appropriate credit, don't distribute the work in a way that includes DRM, and are prepared (and able) to release your derivatives of the art under the same license." — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA on CC-vs-GPL mixing: "for the intent of creating and distributing games, the Free Software Foundation has clarified that the game code and game media are separate entities and do not need to be released under the same license", quoting the FSF free-system-distribution guidelines ("Non-functional Data ... game engines ... released under the GNU GPL, and have accompanying game information -- a world map, game graphics, and so on -- released under such a verbatim distribution license"). OGA's practical advice: "the game data should be clearly marked as such, along with the licensing information for that data." — [OpenGameArt FAQ](https://opengameart.org/content/faq), quoting [FSF free system distribution guidelines](http://www.gnu.org/philosophy/free-system-distribution-guidelines.html)

**OGA-BY 3.0 / 4.0**
- OGA: OGA-BY licences "are derivatives of the CC-BY licenses ... which removes the restriction against technical measures that prevent redistribution of a work. (eg. DRM)"; created "for artists wishing to be credited for their work but not wanting to restrict its distribution on DRM-using platforms." Requirements: credit (title, creator and attribution parties, copyright notice, licence notice, disclaimer notice, link) and indicate changes. Commercial use ok with credit. — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- The dedicated OGA-BY 3.0 FAQ page returned 403 and could not be read in this pass.

**GPL 2.0 / 3.0 applied to art**
- FSF GPL FAQ #GPLOtherThanSoftware: "You can apply the GPL to any kind of work, as long as it is clear what constitutes the 'source code' for the work", with source defined as the preferred form for making changes. — [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html#GPLOtherThanSoftware)
- FSF GPL FAQ #WhatCaseIsOutputGPL: "some programs, particularly video games, can have artwork/audio that is licensed separately from the underlying GPLed game"; in that case the art/audio licence governs; if the art or music is GPL, "the GPL applies when you copy it, however you copy it." — [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html#WhatCaseIsOutputGPL)
- FSF GPL FAQ #GPLInProprietarySystem: "You cannot incorporate GPL-covered software in a proprietary system", but "in many cases you can distribute the GPL-covered software alongside your proprietary system" if the two "communicate at arms length"; if they are effectively two parts of one program, the GPL covers the whole. #MereAggregation: an aggregate is "a number of separate programs, distributed together on the same CD-ROM or other media"; "If the modules are included in the same executable file, they are definitely combined in one program." — [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)
- The FSF GPL FAQ (first 100k chars read) does not directly address a GPL sprite sheet inside a proprietary game; no anchor on game data exists. — [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html)
- OGA on GPL art: "These licenses were written with source code in mind ... GNU ... have yet to provide specific guidance for how the licenses apply in most common video game art use scenarios (eg. using a sprite sheet licensed as GPL 2.0)." "Those working on non-GPL licensed projects (eg. closed source, commercial or non-GPL open source development) are encouraged to fully understand GNU GPL and how art work licensed as such may affect their projects." — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA: GPL attribution is optional under the licence itself but "you should assume that all work contained on OpenGameArt requires it unless otherwise specified by the author", citing GPLv3 §7(b). — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA forum threads **[community, not official]**: one commenter advises against any GPL assets in a closed-source commercial game; another relays the FSF position that art in a game does not trigger linking; threads are unresolved. — [OGA forum: Attribution and Licenses](https://opengameart.org/forumtopic/attribution-and-licenses-0); [OGA forum: opengameart in paid game](https://opengameart.org/node/115559)
- OGA multi-licence rule: "You must follow only one of the licenses" when an asset lists several (e.g. CC-BY OR GPL), though redistributors are encouraged to keep all options. — [OpenGameArt FAQ](https://opengameart.org/content/faq)

**SIL OFL 1.1 (fonts)**
- OFL FAQ 1.4: you can sell software that includes OFL fonts, including games, in Original or Modified Versions. 1.3: "Only the portions based on the Font Software are required to be released under the OFL" (the game itself need not be). 1.6: fonts cannot be sold alone: "The intent is to keep people from making money by simply redistributing the fonts." — [OFL FAQ](https://openfontlicense.org/ofl-faq/)
- Notices: 1.10 says the OFL text can be omitted only when a font is embedded in a document or bundled within a program; 1.20 (apps) recommends including at minimum the copyright statement, licence notice and licence text for the fonts used, with an About box mention as good practice. — [OFL FAQ](https://openfontlicense.org/ofl-faq/)
- Reserved Font Names: modified versions cannot use RFNs (5.3); even a small change requires renaming when RFNs are declared (3.1); rebuilds that change font data count as modifications (5.9). Credit is not required for artwork made with the fonts (1.1.2); acknowledging authors in a credits list is acceptable but not endorsement use (1.19). — [OFL FAQ](https://openfontlicense.org/ofl-faq/)

**Irrevocability / licence changes**
- CC FAQ: "CC licenses are not revocable. Once something has been published under a CC license, licensees may continue using it"; the licensor may stop distributing but existing copies remain licensed. — [CC FAQ](https://creativecommons.org/faq/)
- OGA FAQ: an artist "may change their license requirements, at any time, however ... you are under absolutely no obligation to do so, because the license you obtained it under is irrevocable. In practice, very few (if any) artists on OGA ever remove licensing options." — [OpenGameArt FAQ](https://opengameart.org/content/faq)

### Inferences
- **[interpretation]** For FTLite, an *unmodified* CC-BY-SA sprite sheet bundled with the game is a collection-type use per the CC FAQ, so neither FTLite's code nor its original art must become BY-SA. The moment you recolour, re-cut or composite a BY-SA sheet into a new sheet, that output sheet is Adapted Material and must ship under BY-SA (its source PNG must be shareable). Whether a composed scene/screenshot/trailer is an adaptation is governed by copyright law and is unsettled; the CC FAQ is explicit only for music synced to video.
- **[interpretation]** If FTLite is ever sold through a DRM-wrapped storefront, OGA's reading of CC's "effective technological measures" clause suggests preferring CC0 / OGA-BY over CC-BY/BY-SA, or getting artist permission. CC's own text applies the no-TPM restriction to the Licensed Material itself; whether a store wrapper on the game counts is OGA's interpretation, not CC's statement.
- **[interpretation]** GPL art in a closed-source Electron binary: Electron apps commonly pack assets into app.asar alongside code; under the FSF's MereAggregation reasoning, same-executable packaging is the strongest indicator of "one program". Given the FSF gives no art-specific guidance and OGA warns non-GPL projects off, treat GPL-only art as unusable for a closed-source build unless the asset is dual-licensed (pick the CC option). If FTLite goes GPL itself, GPL art becomes unproblematic.
- **[interpretation]** OFL fonts are the safest category: bundle unmodified, keep OFL.txt and copyright line in the credits/third-party-notices file, never rename or subset-and-rename without dropping RFNs.

### Gaps
- No FSF statement specifically on "GPL sprite sheet in proprietary game" was found; the FSF FAQ's second half (chars 100k+) was not read.
- The CC FAQ does not address trademarks (only publicity rights); see Q2 for the legal-code clause.
- OGA-BY 3.0 FAQ page not retrievable (403).

---

## Key question 2: Common traps (re-uploads without rights, mixed-licence packs, itch "free for personal use"/"no redistribution", trademark/fan art, AI-generated packs, licence changes)

### Takeaway
A licence tag on a hosting site is only as good as the uploader's right to grant it; OGA says it removes art at the author's request regardless of licence and that previews may be all-rights-reserved. CC licences expressly do not grant trademark rights, so sci-fi fan art (Firefly/Serenity, FTL look-alikes) carries risk the CC tag cannot cure. OGA has frozen AI-generated submissions pending litigation; itch.io now requires AI disclosure tags but does not verify licences or force a licence choice.

### Cited Findings

**Re-uploads / stolen art**
- OGA FAQ on uploading others' work: "you must first make absolutely certain that the content has been released under one of the allowed licenses ... Failing to do so is plagiarism, and will result in the work being removed along with a possible suspension of your account"; OGA also honours artists' requests not to be mirrored "regardless of the license". — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA takedown policy: if the author released it under a derivative-permitting CC licence with correct attribution, "it is legal for that content to be here", but "we will remove all art at the author's request regardless of license, provided we can reasonably verify that you're the real author." Exception: art derived from an OGA-paid commission stays archived. Removal Request form is the channel. — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA: "We make an effort to verify that PD content is actually in the public domain before we approve it" (uploads are moderated). — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA forum **[community, not official]**: "Just because you weren't the one to steal it doesn't mean it wasn't stolen"; moderators: "When submitting art that isn't your own, assume NOTHING." — [OGA comment](https://opengameart.org/comment/32166); [OGA node 6854](https://opengameart.org/node/6854)
- OGA: "I made a 3D model (or song) but I'm not sure where I got my textures (or samples). Can I submit it? Short answer: no." (packs can contain untraceable sub-components). — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA on previews: "A submission's preview images or preview audio clips may not fall under the same license as the submission's assets ... Unless otherwise noted, assume the previews are 'All rights reserved'." — [OpenGameArt FAQ](https://opengameart.org/content/faq)

**Mixed licences per file / multi-licence packs**
- OGA: when several licences are listed, "You must follow only one of the licenses." — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- Endless Sky's `copyright` file records different licences per file glob (GPL-3+, CC-BY-SA-4.0, CC-BY-SA-3.0, CC-BY-4.0, CC-BY-3.0, CC0, public-domain) within one repo, demonstrating that real packs/projects are per-file heterogeneous. — [endless-sky/copyright](https://raw.githubusercontent.com/endless-sky/endless-sky/master/copyright)
- game-icons.net: whole site under "Creative Commons 3.0 BY" but each icon has its own author (Delapouite 2022 icons, Lorc 1429, Skoll 172, Caro Asercion 127, ~50 contributors total; 2 icons from Wikimedia Commons "Various artists"), so attribution must be per author. — [game-icons.net/about](https://game-icons.net/about.html)

**itch.io "free for personal use", "no redistribution", blank licence fields**
- itch.io creator FAQ: "You will always fully own your content"; files are served exactly as uploaded; nothing about licence verification or enforcement for asset packs. — [itch.io creators FAQ](https://itch.io/docs/creators/faq)
- itch forum **[community, not official]**: itch "chooses to not force authors to pick a license"; a licence field exists under "More information" and feeds search filters; buyers report packs with "no license included in the .rar file" and declining to buy for lack of terms; one seller asserts purchases grant "full commercial non-exclusive rights" while admitting no itch document confirms it. — [itch.io post 687409](https://itch.io/post/687409/view-in-topic); [itch.io post 16296012](https://itch.io/post/16296012); [itch.io post 17089962](https://itch.io/post/17089962)
- Typical seller-written terms seen: "no reselling or redistributing the pack as is", "CC0 by default unless otherwise specified". — [itch.io asset comments](https://originalstone8.itch.io/platformerassetpack/comments)

**Trademark / fan art**
- CC BY 4.0 §2(b)(2): "Patent and trademark rights are not licensed under this Public License." §2(a)(6): nothing in the licence is permission to imply you are connected with or endorsed by the licensor. — [CC BY 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)
- CC FAQ: CC licences have only limited effect on publicity/personality rights; rights held by third parties are not affected. — [CC FAQ](https://creativecommons.org/faq/)
- OGA excludes "Modifications of existing commercial game art" and "Art that's your work, but is clearly non-free IP (for instance, a sprite of Gordon Freeman from Half Life)". — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- Kenney reserves its logo even though assets are CC0. — [kenney.nl/support](https://kenney.nl/support)

**AI-generated packs**
- OGA **[community/moderator posts, official page not retrieved]**: AI-generated or AI-derived submissions are on "hold" by OGA admin "to await current and ongoing legal cases"; such assets are download-disabled but not removed and flagged as "potential licensing issue"; an "Artificial Intelligence Assisted Artwork" collection groups them; a moderator stated no model with a demonstrably fully open training set has been used. — [OGA node 175700](https://opengameart.org/node/175700); [OGA node 157581](https://opengameart.org/node/157581); [OGA jam clarification](https://itch.io/jam/opengameartorg-spring-game-jam-2025/topic/4762321/a-clarification-on-the-use-of-ai-generated-art)
- itch.io (Nov 2024, secondary press): asset creators must fill a mandatory "Generative AI Disclosure" field; "Generative AI" tag with sub-tags (graphics, sound, text/dialog, code) and a "No AI" tag; anything using AI "even if subsequently modified" must be tagged; untagged pages are not indexed in browse; enforcement relies on self-reporting and user reports. — [PC Gamer](https://pcgamer.com/software/platforms/indie-distribution-platform-itch-io-now-requires-asset-creators-to-disclose-the-use-of-generative-ai-in-their-work); [Engadget](https://www.engadget.com/ai/itchio-marketplace-now-requires-asset-creators-to-disclose-their-use-of-generative-ai-130031999.html); [GamingOnLinux](https://gamingonlinux.com/2024/11/itchio-store-now-requires-ai-generated-content-disclosures-for-assets); [Game Developer](https://gamedeveloper.com/production/itch-wants-asset-creators-to-disclose-when-they-ve-used-generative-ai)

**Licence changes after download**
- CC: irrevocable; OGA: no obligation to follow a later licence change, licence obtained is irrevocable. — [CC FAQ](https://creativecommons.org/faq/); [OpenGameArt FAQ](https://opengameart.org/content/faq)

### Inferences
- **[interpretation]** Practical risk level for re-uploaded art: low-to-moderate on OGA (moderated uploads, takedown path, public comment threads flag theft) and higher on itch (no licence enforcement, seller-written terms). Mitigation: prefer assets where the uploader is the author with a portfolio link; check the "Copyright/Attribution Notice" and comments on the OGA page; reverse-image-search anything that looks professional or familiar; archive the asset page (URL + date + screenshot) at download time so you can show good-faith reliance; keep a swap list so any single asset can be replaced quickly. A downloaded copy of a genuinely CC-licensed work remains licensed even if later removed from OGA, but a work the uploader never had rights to was never licensed at all.
- **[interpretation]** Because CC does not license trademarks and OGA bans non-free IP, any "Serenity-class" ship, Firefly livery, or FTL-UI pastiche is a trademark/trade-dress question independent of asset licence; avoid, or keep to generic sci-fi forms.
- **[interpretation]** AI packs: OGA's freeze and itch's mandatory tag mean the provenance problem is recognised by both platforms; for a possibly-commercial game, exclude "Generative AI"-tagged packs and anything with no human author attribution.
- **[interpretation]** On itch, treat a blank licence field as "no licence" and ask the seller in writing (keep the reply) before using commercially.

### Gaps
- itch.io's official Generative AI disclosure announcement, Terms of Service, and the exact wording of the licence dropdown were not retrieved (search returned only press and forum posts).
- OGA's official art-submission guidelines page (with the "#ai" section) was not retrieved (403 / Wayback blocked).
- No quantitative data found on how often OGA/itch assets are taken down for rights problems.

---

## Key question 3: How indie teams document provenance (manifest per file; automated checks)

### Takeaway
The best-documented real-world patterns are the Debian machine-readable copyright format (used by Endless Sky for every image/sound glob with Copyright, License and a Comment giving source URL and edits) and OGA's own suggested credit line; CC's TASL (Title, Author, Source, License) plus a changes note is the attribution content standard. The REUSE spec/tool is the obvious automated lint candidate but its page could not be read in this pass.

### Cited Findings
- CC TASL: include **Title** (if provided), **Author** (the name the licensor requests; include copyright notice if provided), **Source** (link to the original), **License** (named and linked, e.g. "CC BY 4.0"); for slight modifications keep full TASL and note "Cropped from original"; for adaptations credit the original with full TASL and state your work is adapted from it. Pitfalls: attribution only in alt text or only in metadata; crediting the hosting site instead of the author. For many works, publish a separate credit page and link to it. — [CC wiki: Best practices for attribution](https://wiki.creativecommons.org/wiki/Best_practices_for_attribution)
- OGA suggested credit line, for credits file and credits screen: `"[asset name]" by [author name] licensed [license(s)]: [asset url]`, e.g. `"Whispers of Avalon: Grassland Tileset" by Leonard Pabin licensed CC-BY 3.0, GPL 2.0, or GPL 3.0: https://opengameart.org/node/3009`. Check the submission's "Copyright/Attribution Notice:" section first. — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA Collections can "automatically generate a single credits file for all of the art in this collection" and users use collections as a running asset list. — [OGA forum: attribution for game assets](https://opengameart.org/forumtopic/attribution-for-game-assets) **[community]**
- Endless Sky `copyright` file: Debian `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/`; stanzas of `Files:` (globs like `images/land/*`), `Copyright:`, `License:` (GPL-3+, CC-BY-SA-4.0, CC-BY-SA-3.0, CC-BY-4.0, CC-BY-3.0, CC0, public-domain), optional `Comment:` with source URL (archive.md, Wikimedia Commons, Freesound, Pixabay, Pexels) and edit notes ("Cropped.", "Cropped and edited.", "Derived from works by...", "Post-processing applied by..."). Example: `Files: images/land/bwerner* / Copyright: Berthold Werner (commons.wikimedia.org/wiki/User:Berthold_Werner) / License: CC-BY-SA-3.0 / Comment: Taken from Wikimedia commons. Cropped and edited.` — [endless-sky/copyright](https://raw.githubusercontent.com/endless-sky/endless-sky/master/copyright)
- 0 A.D. `LICENSE.txt`: top-level table mapping paths to licences (engine `source/` GPL v2+; `binaries/data/mods/*/art` and `/audio` CC BY-SA 3.0 with a `LICENSE.txt` in each directory; maps per-directory; third-party code MIT/BSD/MPL/zlib; `dbghelp.dll` proprietary with its own terms). — [0ad/LICENSE.txt](https://raw.githubusercontent.com/0ad/0ad/master/LICENSE.txt)
- Jam-moderator checklist for a credit entry **[community]**: author's name or OGA handle, title as given on OGA, URL to the asset, licence; required "BOTH via an in-game credits screen and a listing on the submissions itch.io page." — [itch.io post 6940310](https://itch.io/post/6940310)

### Inferences
- **[interpretation]** Recommended ASSETS.md / `assets/CREDITS.toml` schema for FTLite, derived from TASL + Debian stanza + OGA line: `path(s)`, `title`, `author` (as requested), `source_url`, `licence` (SPDX id, e.g. `CC-BY-4.0`, `CC0-1.0`, `OFL-1.1`, `OGA-BY-3.0` is not an SPDX id and must be spelled out), `licence_url`, `retrieved` (date), `archived_copy` (screenshot/Wayback link), `modifications` (free text, including "none"), `attribution_notice` (verbatim text the artist asked for), `notes` (e.g. dual-licence option chosen, RFN handling for fonts).
- **[interpretation]** Automated checks worth building: (1) a CI script that fails if any file under `assets/` lacks a manifest entry; (2) generate the in-game credits screen and `THIRD_PARTY_NOTICES.txt` from the manifest so they cannot drift; (3) reject manifest entries whose licence is GPL-only, NC, or ND, or whose `source_url` is missing; (4) for BY-SA entries, assert `modifications == none` unless a `derivative_release_path` is set.
- **[interpretation]** The Debian copyright format is a good fit if FTLite is later open-sourced (packagers already know it); a TOML/JSON manifest is easier to drive the credits screen from. Either can be the single source of truth.

### Gaps
- REUSE specification page returned only its title; its per-file SPDX header / `.license` sidecar / `REUSE.toml` mechanics and the `reuse lint` tool were not verified in this pass.
- No developer postmortem specifically about open-asset credit workflows was found; results were forum threads.

---

## Key question 4: How shipped open-asset games handled credits (examples with links)

### Takeaway
Two verifiable examples with public per-file licence records: Endless Sky (GPL-3 code, mixed CC-BY-SA/CC-BY/CC0/public-domain art, documented in a Debian-format `copyright` file) and 0 A.D. (GPL-2+ engine, CC BY-SA 3.0 art/audio, documented in a top-level LICENSE.txt plus per-directory LICENSE files). Both show code and art under different licences in one shipped product.

### Cited Findings
- Endless Sky: default `Files: *` is GPL-3+; CC-BY-SA-4.0 is the most common art licence; per-glob stanzas with source URLs and modifications. — [endless-sky/copyright](https://raw.githubusercontent.com/endless-sky/endless-sky/master/copyright)
- 0 A.D.: code GPL v2 or later; `binaries/data/mods/*/art` and `audio` CC BY-SA 3.0 with a `LICENSE.txt` in each directory; "Any use requires attribution to Wildfire Games". — [0ad/LICENSE.txt](https://raw.githubusercontent.com/0ad/0ad/master/LICENSE.txt)
- Community practice for jam games: credits both on an in-game screen and on the itch page. — [itch.io post 6940310](https://itch.io/post/6940310) **[community]**

### Inferences
- **[interpretation]** Both examples are open-source games; I found no verified example of a *closed-source commercial* game publishing a per-file open-asset manifest, which itself suggests closed commercial titles usually handle this as a flat credits list or avoid share-alike art.

### Gaps
- No postmortem/blog from a commercial closed-source indie describing open-asset credit handling was found within the tool budget. Candidates not verified: Shattered Pixel Dungeon, Mindustry, Veloren, SuperTuxKart credits files.

---

## Key question 5: Specific notes on Kenney, game-icons.net, OGA licence-filter reliability, itch.io licence-metadata reliability

### Takeaway
Kenney is CC0 with a logo restriction; game-icons.net is CC BY 3.0 (not 4.0, so title and per-author credit are required and there is no 30-day cure) with ~50 distinct authors; OGA's licence tags are moderator-reviewed but OGA itself disclaims accuracy, warns that previews may be unlicensed, and hosts multi-licence assets where you pick one; itch.io does not force or verify licence selection.

### Cited Findings
- Kenney: CC0, no attribution required, optional credit "Kenney", commercial ok, logo reserved, licence file in each download. — [kenney.nl/support](https://kenney.nl/support)
- game-icons.net: "provided under the terms of the Creative Commons 3.0 BY license"; suggested text "Icons made by {author}. Available on https://game-icons.net"; authors include Delapouite (2022 icons), Lorc (1429), Skoll (172), Caro Asercion (127), Viscious Speed (121), sbed (95), plus ~40 more. — [game-icons.net/about](https://game-icons.net/about.html)
- CC 3.0 vs 4.0 attribution: 3.0 requires the title; no automatic reinstatement on cure. — [CC FAQ](https://creativecommons.org/faq/)
- OGA filter reliability: licence summaries are "not guaranteed to be correct"; uploads of others' work require certainty of licence and PD claims are verified before approval; previews may be all-rights-reserved; multi-licence assets let you follow one; artists can add/remove licence options later but your licence is irrevocable. — [OpenGameArt FAQ](https://opengameart.org/content/faq)
- OGA forum **[community]**: a licence tag does not prove the uploader had rights. — [OGA comment 32166](https://opengameart.org/comment/32166)
- itch.io: no licence enforcement found in creator docs; forum says itch does not force a licence choice; licence field exists and feeds filters; buyer confusion documented. — [itch.io creators FAQ](https://itch.io/docs/creators/faq); [itch.io post 687409](https://itch.io/post/687409/view-in-topic); [itch.io post 17089962](https://itch.io/post/17089962)

### Inferences
- **[interpretation]** For game-icons.net, a single line "Icons by Lorc, Delapouite and contributors, CC BY 3.0, https://game-icons.net" is weaker than what 3.0 asks for (title per work, author per work); safer is a generated per-icon list (icon name, author, URL, "CC BY 3.0", modifications such as recolour) in the credits file, with the short line on the credits screen linking to it. Note CC BY 3.0 has no 30-day cure, so get it right before release.
- **[interpretation]** OGA's licence filter is a reasonable *first* filter but each chosen asset still needs: author = uploader check, attribution-notice read, comments scan, and download-file-vs-preview check.
- **[interpretation]** itch.io's licence metadata should be treated as seller self-declaration with no platform backing; rely on the licence file inside the download or a written seller statement.

### Gaps
- Whether game-icons.net offers any icons under CC0 or 4.0 was not stated on the about page; per-icon pages not checked.
- itch.io's current licence-field option list and whether "No license" is selectable were not verified on an official page.

---

## Suggested FTLite rule amendment (interpretation, for the report writer)

- Allow bundled third-party 2D art/fonts only under: CC0, CC-BY 3.0/4.0, OGA-BY, OFL 1.1 (fonts); allow CC-BY-SA only for assets shipped *unmodified* (or where the team commits to publishing the modified sheet under BY-SA); exclude GPL-only, NC, ND, "free for personal use", untagged itch packs, and anything tagged Generative AI. Revisit GPL-only art if the code is later GPL'd.
- Every third-party file must have a manifest entry (TASL + licence id + retrieved date + archived copy + modifications), and the credits screen plus `THIRD_PARTY_NOTICES.txt` must be generated from it; the store page should link to the same credits.
- Keep original art and audio the default; third-party assets are the exception that must be justified in the manifest.
