"""Filter AI-generated enrichment down to what the document supports.

The model proposes; this decides. A glossary entry or a diagram component that
cannot quote the source is removed before rendering, and the caller is told
what went and why - a silent drop is indistinguishable from a bug, and a
printed fabrication is worse than either.

Nothing here talks to a model. The AI runs in the extension host, against
whatever provider the user already has in their editor; this side only ever
sees its output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from .evidence import EvidenceMatcher


@dataclass
class Dropped:
    kind: str
    label: str
    reason: str

    def to_dict(self) -> Dict[str, str]:
        return {"kind": self.kind, "label": self.label, "reason": self.reason}


@dataclass
class Enrichment:
    """What survived validation."""

    summary: str | None = None
    glossary: List[Dict[str, str]] = field(default_factory=list)
    diagrams: List[Dict[str, Any]] = field(default_factory=list)
    dropped: List[Dropped] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "glossary": self.glossary,
            "diagrams": self.diagrams,
            "dropped": [item.to_dict() for item in self.dropped],
        }


class EnrichmentValidator:
    def __init__(self, matcher: EvidenceMatcher | None = None) -> None:
        self.matcher = matcher or EvidenceMatcher()

    def validate(self, source: str, proposed: Dict[str, Any]) -> Enrichment:
        result = Enrichment()

        summary = proposed.get("summary")
        if isinstance(summary, str) and summary.strip():
            result.summary = summary.strip()

        result.glossary = self._glossary(source, proposed.get("glossary") or [], result.dropped)
        result.diagrams = self._diagrams(source, proposed.get("diagrams") or [], result.dropped)
        return result

    def _glossary(self, source: str, entries: Any, dropped: List[Dropped]) -> List[Dict[str, str]]:
        kept: List[Dict[str, str]] = []
        seen: set[str] = set()

        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict):
                continue

            term = str(entry.get("term") or "").strip()
            definition = str(entry.get("definition") or "").strip()
            evidence = str(entry.get("evidence") or "").strip()

            if not term or not definition:
                dropped.append(Dropped("glossary", term or "(unnamed)", "missing a term or definition"))
                continue

            # A term the document never mentions is not this document's
            # glossary, however correct the definition happens to be.
            if not self.matcher.is_grounded(term, source):
                dropped.append(Dropped("glossary", term, "the term does not appear in the document"))
                continue

            if not evidence:
                dropped.append(Dropped("glossary", term, "no supporting quote was given"))
                continue

            if not self.matcher.is_grounded(evidence, source):
                dropped.append(Dropped("glossary", term, "the supporting quote is not in the document"))
                continue

            key = term.lower()
            if key in seen:
                continue
            seen.add(key)

            kept.append({"term": term, "definition": definition, "evidence": evidence})

        kept.sort(key=lambda item: item["term"].lower())
        return kept

    def _diagrams(self, source: str, diagrams: Any, dropped: List[Dropped]) -> List[Dict[str, Any]]:
        kept: List[Dict[str, Any]] = []

        for diagram in diagrams if isinstance(diagrams, list) else []:
            if not isinstance(diagram, dict):
                continue

            identifier = str(diagram.get("id") or f"diagram-{len(kept) + 1}")
            code = str(diagram.get("mermaid") or diagram.get("code") or "").strip()
            if not code:
                dropped.append(Dropped("diagram", identifier, "no mermaid source"))
                continue

            components = diagram.get("components")
            grounded, ungrounded = self._components(source, components)

            for component in ungrounded:
                dropped.append(
                    Dropped("component", f"{identifier}: {component}", "not backed by a quote from the document")
                )

            # A diagram whose every box was invented is a picture of something
            # that is not in the document.
            if components and not grounded:
                dropped.append(Dropped("diagram", identifier, "none of its components appear in the document"))
                continue

            kept.append(
                {
                    "id": identifier,
                    "code": code,
                    "title": diagram.get("title"),
                    "components": grounded,
                }
            )

        return kept

    def _components(self, source: str, components: Any) -> tuple[List[str], List[str]]:
        grounded: List[str] = []
        ungrounded: List[str] = []

        for component in components if isinstance(components, list) else []:
            if isinstance(component, str):
                name, evidence = component, component
            elif isinstance(component, dict):
                name = str(component.get("name") or "").strip()
                evidence = str(component.get("evidence") or "").strip() or name
            else:
                continue

            if not name:
                continue

            (grounded if self.matcher.is_grounded(evidence, source) else ungrounded).append(name)

        return grounded, ungrounded


def missing_headings(source_headings: List[str], rendered_headings: List[str]) -> List[str]:
    """Headings in the source that never made it into the output.

    Enrichment must not quietly lose a section. The check is on normalised
    text so that a heading rewritten only in punctuation or casing still
    counts as present.
    """
    from .evidence import normalize

    present = {normalize(heading) for heading in rendered_headings}
    return [heading for heading in source_headings if normalize(heading) not in present]
