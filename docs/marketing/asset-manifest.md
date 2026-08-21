# Marketing asset manifest

All production marketing assets must be owned, licensed, or generated from the
tenant-local synthetic MergeCom workspace. Raw capture files stay outside the
production bundle.

| Asset | Source and license | Dimensions | Intended use |
|---|---|---:|---|
| `fonts/inter-latin-variable.woff2` | Fontsource 5.3.0, Inter, SIL OFL 1.1 | Variable font | Public-site body and UI type |
| `fonts/newsreader-latin-variable.woff2` | Fontsource 5.3.0, Newsreader, SIL OFL 1.1 | Variable font | Public-site display type |
| `fonts/OFL-1.1.txt` | Fontsource license text | Text | Bundled font license |
| `marketing/comparison-workspace.webp` | Owned synthetic MergeCom comparison composition, captured from `website/w2-shell-hero` and fixture `marketing-comparison-v1` | 1280 x 514 | Desktop hero poster and product chapter |
| `marketing/comparison-workspace-mobile.webp` | Owned synthetic MergeCom single-pane comparison composition, captured from `website/w2-shell-hero` and fixture `marketing-comparison-v1` | 390 x 404 | Mobile product chapter and poster crop |
| `marketing/mergecom-social-card.webp` | Owned MergeCom homepage capture using synthetic product content | 1200 x 630 | Open Graph and social preview |
| `favicon.svg` | Owned MergeCom lettermark constructed in repository source | 64 x 64 view box | Browser and manifest icon |
| `apple-touch-icon.png` | Rasterized owned MergeCom lettermark | 180 x 180 | Apple touch icon |
| `site.webmanifest` | Repository-authored application metadata | Text | Install metadata and SVG icon declaration |

The legacy `images/mergecom-team.jpg` and `images/project-review.jpg` assets are
not approved as primary marketing-story media. They remain only for historical
compatibility until the new homepage no longer references them.
