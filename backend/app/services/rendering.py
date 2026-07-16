from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

try:
    from weasyprint import HTML as WeasyHTML
except Exception:  # pragma: no cover
    WeasyHTML = None

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, ListFlowable
except Exception:  # pragma: no cover
    colors = None
    letter = None
    ParagraphStyle = None
    getSampleStyleSheet = None
    inch = None
    Paragraph = None
    SimpleDocTemplate = None
    Spacer = None
    ListFlowable = None


class RenderingService:
    def __init__(self, output_dir: str) -> None:
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def render(self, artifact_id: str, structured_json: Dict[str, Any], artifact_type: str, source_path: str, commit_hash: str | None = None) -> Dict[str, Any]:
        title = structured_json.get("title", "Documentation")
        abstract = structured_json.get("abstract", "")
        output_path = Path(self.output_dir) / f"{artifact_id}.pdf"
        html = self._build_html(title, abstract, structured_json, artifact_type, source_path, commit_hash)

        rendered = False
        if WeasyHTML is not None:
            try:
                WeasyHTML(string=html).write_pdf(output_path)
                rendered = output_path.exists()
            except Exception:
                rendered = False

        if not rendered and SimpleDocTemplate is not None:
            self._render_with_reportlab(output_path, title, abstract, structured_json, artifact_type, source_path, commit_hash)
            rendered = output_path.exists()

        if not rendered:
            raise RuntimeError("PDF rendering failed")

        return {"pdf_path": str(output_path)}

    def _build_html(self, title: str, abstract: str, structured_json: Dict[str, Any], artifact_type: str, source_path: str, commit_hash: str | None = None) -> str:
        sections = structured_json.get("sections", [])
        grouped_sections = self._group_sections(sections)
        section_html = ""
        toc_html = ""
        for group_name, items in grouped_sections.items():
            if not items:
                continue
            section_html += f"<h2>{group_name}</h2>"
            for section in items:
                section_html += f"<h3>{section.get('heading', '')}</h3><p>{section.get('content', '')}</p>"
                toc_html += f"<li>{section.get('heading', '')}</li>"
        badge = artifact_type or "other"
        footer = f"<div class='footer'>source: {source_path} | commit: {commit_hash or 'n/a'}</div>"
        return f"""
        <html>
          <head>
            <style>
              body {{ font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; }}
              .cover {{ page-break-after: always; padding: 40px 24px; }}
              .title {{ font-size: 28px; font-weight: bold; margin-bottom: 8px; }}
              .meta {{ color: #4b5563; font-size: 12px; margin-bottom: 16px; }}
              .badge {{ display: inline-block; background: #e5e7eb; padding: 6px 10px; border-radius: 999px; font-size: 12px; margin-bottom: 20px; }}
              .toc {{ margin-top: 24px; }}
              .footer {{ margin-top: 32px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }}
            </style>
          </head>
          <body>
            <div class='cover'>
              <h1 class='title'>{title}</h1>
              <div class='meta'>Generated from {source_path}</div>
              <div class='badge'>{badge}</div>
              <p>{abstract}</p>
              <div class='toc'>
                <h2>Table of contents</h2>
                <ul>{toc_html}</ul>
              </div>
            </div>
            {section_html}
            {footer}
          </body>
        </html>
        """

    def _render_with_reportlab(self, output_path: Path, title: str, abstract: str, structured_json: Dict[str, Any], artifact_type: str, source_path: str, commit_hash: str | None = None) -> None:
        if SimpleDocTemplate is None:
            raise RuntimeError("reportlab is not available")
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle("TitleStyle", parent=styles["Title"], fontSize=20, leading=24, spaceAfter=12)
        body_style = ParagraphStyle("BodyStyle", parent=styles["BodyText"], fontSize=11, leading=14)
        story = []
        story.append(Paragraph(title, title_style))
        story.append(Paragraph(f"Generated from {source_path}", styles["BodyText"]))
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(f"Artifact type: {artifact_type}", body_style))
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(abstract or "No abstract provided.", body_style))
        story.append(Spacer(1, 0.15 * inch))
        story.append(Paragraph("Table of contents", styles["Heading2"]))
        for section in structured_json.get("sections", []):
            story.append(Paragraph(section.get("heading", "Section"), body_style))
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph("Body", styles["Heading2"]))
        for section in structured_json.get("sections", []):
            story.append(Paragraph(section.get("heading", "Section"), styles["Heading3"]))
            story.append(Paragraph(section.get("content", ""), body_style))
            story.append(Spacer(1, 0.08 * inch))
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph(f"source: {source_path} | commit: {commit_hash or 'n/a'}", styles["Italic"]))
        document = SimpleDocTemplate(str(output_path), pagesize=letter)
        document.build(story)

    def _group_sections(self, sections: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        groups = {
            "Task sections": [],
            "User story sections": [],
            "Design decision sections": [],
            "Other sections": [],
        }
        for section in sections:
            section_type = str(section.get("type") or "normal")
            if section_type == "task":
                groups["Task sections"].append(section)
            elif section_type == "user_story":
                groups["User story sections"].append(section)
            elif section_type == "design_decision":
                groups["Design decision sections"].append(section)
            else:
                groups["Other sections"].append(section)
        return groups
