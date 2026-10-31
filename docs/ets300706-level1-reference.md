# Teletext Level 1 reference used by skeletext

This file records the facts the skeleton is built on and where each one was checked. It was compiled on 2026-10-31 by reading the ETSI document itself and cross-checking against two Wikipedia articles.

## Sources

1. **Primary:** ETSI ETS 300 706, "Enhanced Teletext specification", May 1997. PDF: https://www.etsi.org/deliver/etsi_i_ets/300700_300799/300706/01_60/ets_300706e01p.pdf . The text was extracted with `pdftotext -layout` and read directly. Clause 12.2 "Spacing attributes" and Table 26 (document pages 76 to 80) define the control codes. Annex H (Code of practice for Fastext) defines the four coloured keys.
2. **Cross-check A:** Wikipedia, "Teletext" (https://en.wikipedia.org/wiki/Teletext), for grid size and the end of the BBC Ceefax service.
3. **Cross-check B:** Wikipedia, "Teletext character set" (https://en.wikipedia.org/wiki/Teletext_character_set) and "World System Teletext" (https://en.wikipedia.org/wiki/World_System_Teletext), for the order of the 32 control codes and the 2x3 mosaic matrix. Both cite the same ETSI PDF for these points.

## Grid

- ETS 300 706 states that Level 1 gives "24 rows of 40 columns". Wikipedia ("Teletext") gives the same size, "a monospaced 40x24 character grid".
- Row 0 is the page header (packet X/0). Rows 1 to 23 carry body text (packets X/1 to X/23). The standard also defines a packet X/24 that is used for Fastext prompts, and its address table counts that as row 24.
- **Design decision:** skeletext models the display as 24 rows (0 to 23) by 40 columns, as the Level 1 statement says. The bottom row, row 23, is used by the skeleton as the Fastext prompt row. The separate X/24 packet of a broadcast page is not modelled because nothing is broadcast.
- At the start of each row the decoder returns to these defaults: Alpha White (0/7), Steady (0/9), End Box (0/A), Normal Size (0/C), Contiguous Mosaic Graphics (1/9), Black Background (1/C) and Release Mosaics (1/F).
- Every spacing attribute occupies one cell and is displayed as a space, except while Hold Mosaics is active (see below).

## Spacing attributes (ETS 300 706 Table 26)

Hex code is column/row of the character table, so 0/1 is byte 0x01 and 1/E is byte 0x1E.

| Byte | Table code | Name | Timing | Notes |
| --- | --- | --- | --- | --- |
| 0x00 | 0/0 | Alpha Black | Set-After | Not interpreted at Levels 1 and 1.5, treated as a plain space |
| 0x01 | 0/1 | Alpha Red | Set-After | Selects G0 text mode |
| 0x02 | 0/2 | Alpha Green | Set-After | |
| 0x03 | 0/3 | Alpha Yellow | Set-After | |
| 0x04 | 0/4 | Alpha Blue | Set-After | |
| 0x05 | 0/5 | Alpha Magenta | Set-After | |
| 0x06 | 0/6 | Alpha Cyan | Set-After | |
| 0x07 | 0/7 | Alpha White | Set-After | Start-of-row default |
| 0x08 | 0/8 | Flash | Set-After | Cancelled by Steady or a new row |
| 0x09 | 0/9 | Steady | **Set-At** | Start-of-row default |
| 0x0A | 0/A | End Box | Set-After | Start-of-row default |
| 0x0B | 0/B | Start Box | Set-After | Only meaningful on newsflash and subtitle pages |
| 0x0C | 0/C | Normal Size | **Set-At** | Start-of-row default |
| 0x0D | 0/D | Double Height | Set-After | Row below is not displayed with its own data. Not for rows 23 and 24 |
| 0x0E | 0/E | Double Width | Set-After | Not interpreted at Levels 1 and 1.5 |
| 0x0F | 0/F | Double Size | Set-After | Not interpreted at Levels 1 and 1.5 |
| 0x10 | 1/0 | Mosaics Black | Set-After | Not interpreted at Levels 1 and 1.5 |
| 0x11 to 0x17 | 1/1 to 1/7 | Mosaics Red, Green, Yellow, Blue, Magenta, Cyan, White | Set-After | Selects G1 mosaic mode |
| 0x18 | 1/8 | Conceal | **Set-At** | Following cells show as spaces until a colour code or the end of the row, or until the viewer reveals |
| 0x19 | 1/9 | Contiguous Mosaic Graphics | **Set-At** | Start-of-row default |
| 0x1A | 1/A | Separated Mosaic Graphics | **Set-At** | |
| 0x1B | 1/B | ESC (Switch) | Set-After | Toggles between two G0 sets, which skeletext does not use |
| 0x1C | 1/C | Black Background | **Set-At** | Start-of-row default |
| 0x1D | 1/D | New Background | **Set-At** | The current foreground colour becomes the background colour immediately |
| 0x1E | 1/E | Hold Mosaics | **Set-At** | Control cells show the held mosaic character instead of a space |
| 0x1F | 1/F | Release Mosaics | Set-After | Start-of-row default |

The ETS summary sentence says there are 32 spacing attributes, "four without response at Levels 1 and 1.5". Those four are Alpha Black (0x00), Mosaics Black (0x10), Double Width (0x0E) and Double Size (0x0F). skeletext follows that: at Level 1 they are spaces with no effect.

**Set-At** means the attribute changes the display of its own cell and everything after it. **Set-After** means its own cell is unaffected and the change starts at the next cell.

## Mosaic characters (G1)

- A mosaic cell is a 2 by 3 block matrix. In the G1 set the columns 2, 3, 6 and 7 hold mosaics. Bits 1, 2, 3, 4, 5 and 7 of the byte set the top left, top right, middle left, middle right, lower left and lower right blocks. Bit 6 is always 1 for these characters.
- So a block mask with TL=1, TR=2, ML=4, MR=8, LL=16, LR=32 is stored as byte `0x20 | (mask & 0x1F) | (mask & 0x20 ? 0x40 : 0)`. The codes 0x40 to 0x5F in mosaic mode are plain capital letters, because bit 6 is 0.
- Hold Mosaics: the held character is the most recent mosaic character with bit 6 = 1 on that row. It is reset to a space at the start of a row, on a change between text and mosaic mode, and on a size change. It is always shown in its original contiguous or separated form.

## Pages and Fastext

- Pages are addressed by magazine 1 to 8 and a two-digit page number. The standard states that viewers are not meant to select pages that contain hexadecimal digits directly. Decimal numbering therefore gives pages 100 to 899, which is the range skeletext accepts.
- Fastext: packet X/27/0 carries up to six linked page numbers. Annex H says the first four are tied to four keys coloured red, green, yellow and cyan, and the sixth is tied to an Index key. Prompts for the coloured keys are shown on the X/24 row.

## Discrepancies and how they were resolved

| Point | Source 1 (ETSI) | Source 2 (Wikipedia) | Resolution |
| --- | --- | --- | --- |
| Display rows | "24 rows of 40 columns" at Level 1, but packet and address tables go up to row 24 | 40x24 | Model 24 rows. Row 23 is the prompt row. Documented above |
| Name of 0x19 and 0x1A | "Contiguous" and "Separated Mosaic Graphics" | Uses the abbreviations SPL and STL (borrowed from ECMA-48 naming), with a footnote that ETS uses the long names | Use the ETS names |
| Early Ceefax | Not covered | Early Ceefax had 32 characters per line, ORACLE had 22 lines, before the shared World System Teletext standard | Out of scope, skeletext follows WST Level 1 only |
| Alpha Black, Mosaics Black, Double Width, Double Size | Listed as not interpreted at Levels 1 and 1.5, with a caution that some decoders do interpret Black | Lists the same four codes without timing | Treated as spaces without effect |
| Ceefax end | Not covered | BBC closed Ceefax in 2012 when Britain moved to digital television | Quoted from Wikipedia only |

No numeric claim in this file comes from memory. The two Wikipedia pages were read as raw wikitext fetched on 2026-10-31.
