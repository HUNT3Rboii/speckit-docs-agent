// Document styling. Generated content imports this and carries no styling of
// its own, so a change in here restyles every document without touching the
// emitter.

#let doc(
  title: "Untitled",
  subtitle: none,
  source: none,
  generated: none,
  body,
) = {
  set document(title: title)

  set page(
    paper: "a4",
    margin: (top: 2.5cm, bottom: 2.5cm, x: 2.2cm),
    header: context {
      // No running header on the cover.
      if counter(page).get().first() > 1 {
        set text(size: 8pt, fill: luma(110))
        grid(
          columns: (1fr, auto),
          align(left, title),
          align(right, counter(page).display()),
        )
        line(length: 100%, stroke: 0.4pt + luma(200))
      }
    },
  )

  // Both fonts ship with Typst, so this resolves identically on every machine
  // rather than depending on what the user has installed.
  set text(font: ("Libertinus Serif", "New Computer Modern"), size: 10.5pt, lang: "en")
  set par(justify: true, leading: 0.62em)

  // Links need to look like links in print, where there is nothing to hover.
  show link: it => text(fill: rgb("#1a4f8a"), it)

  show heading: set block(above: 1.4em, below: 0.7em)
  set heading(numbering: "1.1")

  // Code: a tinted block, monospaced, syntax-highlighted by Typst itself. The
  // HTML pipeline never had highlighting.
  show raw.where(block: true): it => block(
    fill: luma(247),
    stroke: 0.5pt + luma(220),
    radius: 3pt,
    inset: 9pt,
    width: 100%,
    text(size: 9pt, it),
  )
  show raw.where(block: false): it => box(
    fill: luma(243),
    outset: (y: 2.5pt),
    inset: (x: 2.5pt),
    radius: 2pt,
    text(size: 9.2pt, it),
  )

  set table(
    stroke: (x, y) => (
      top: if y == 0 { 0.8pt } else { 0.4pt } + luma(190),
      bottom: 0.4pt + luma(190),
    ),
    inset: 7pt,
  )
  show table.cell.where(y: 0): set text(weight: "bold")

  show quote: it => block(
    inset: (left: 12pt),
    stroke: (left: 2pt + luma(200)),
    text(style: "italic", fill: luma(60), it.body),
  )

  set figure(gap: 0.9em)
  show figure.caption: set text(size: 9pt, fill: luma(90))

  // Cover
  block(above: 3.5cm, below: 0pt)[
    #text(size: 26pt, weight: "bold")[#title]
    #if subtitle != none [
      #v(0.4em)
      #text(size: 12pt, fill: luma(90))[#subtitle]
    ]
    #v(1.2em)
    #line(length: 100%, stroke: 0.8pt + luma(200))
    #v(0.6em)
    #set text(size: 9pt, fill: luma(110))
    #if source != none [#source #h(1fr)]
    #if generated != none [#generated]
  ]

  pagebreak()

  outline(title: [Contents], depth: 3, indent: auto)

  pagebreak()

  body
}
