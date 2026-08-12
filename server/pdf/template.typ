// Document styling. Generated content imports this and carries no styling of
// its own, so a change in here restyles every document without touching the
// emitter.

// A section's kind, as the HTML pipeline's grouping used to convey.
#let section-label(kind) = block(above: -0.4em, below: 0.6em)[
  #box(
    fill: luma(238),
    inset: (x: 5pt, y: 2pt),
    radius: 2pt,
    text(size: 7.5pt, weight: "medium", fill: luma(80), upper(kind)),
  )
]

// A one-line summary of what follows, when the model produced one.
#let section-summary(body) = block(above: -0.2em, below: 0.7em)[
  #text(size: 9.5pt, style: "italic", fill: luma(90), body)
]

// One line of the cover's metadata block: "Label: value", centred, omitted
// entirely when there is no value - the same rule the HTML pipeline's
// generate_cover_page applied to every key it was handed.
#let meta-line(label, value) = {
  if value != none and value != "" {
    block(above: 0.55em, below: 0.55em, text(size: 8.5pt, fill: luma(119))[#label: #value])
  }
}

#let doc(
  title: "Untitled",
  subtitle: none,
  source: none,
  generated: none,
  project: none,
  model: none,
  doc-type: none,
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

  // Cover page, as the HTML pipeline drew it: top-aligned rather than a
  // vertically-centred title slide, everything centred across the measure, the
  // abstract held to a readable width, and the metadata under a rule at the
  // foot of the block.
  block(above: 0pt, below: 0pt, width: 100%)[
    #set align(center)
    #text(size: 27pt, weight: "bold", fill: rgb("#1a1a1a"))[#title]

    #if subtitle != none [
      #v(0.3in)
      #block(width: 6in)[
        #set par(justify: false, leading: 0.8em)
        #text(size: 10.5pt, fill: luma(85))[#subtitle]
      ]
    ]

    #v(0.4in)
    #line(length: 100%, stroke: 0.5pt + luma(221))
    #v(0.3in)
    #meta-line("Project", project)
    #meta-line("Enriched By", model)
    #meta-line("Type", doc-type)
    #meta-line("Source", source)
    #meta-line("Generated", generated)
  ]

  pagebreak()

  outline(title: [Contents], depth: 3, indent: auto)

  pagebreak()

  body
}
