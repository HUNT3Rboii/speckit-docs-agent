from __future__ import annotations

import os
import html
import re
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
    from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, ListFlowable, PageBreak, Table, TableStyle
    from reportlab.platypus.tableofcontents import TableOfContents
except Exception:  # pragma: no cover
    colors = None
    letter = None
    ParagraphStyle = None
    getSampleStyleSheet = None
    inch = None
    Paragraph = None
    SimpleDocTemplate = None
    TA_LEFT = None
    TA_CENTER = None
    TA_JUSTIFY = None
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
        
        # Create custom styles
        styles = getSampleStyleSheet()
        
        # Title style - large, bold, centered
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontSize=24,
            leading=30,
            textColor=colors.HexColor("#1a1a1a"),
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName="Helvetica-Bold"
        )
        
        # Heading styles
        h1_style = ParagraphStyle(
            "CustomH1",
            parent=styles["Heading1"],
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#2c3e50"),
            spaceAfter=12,
            spaceBefore=16,
            fontName="Helvetica-Bold"
        )
        
        h2_style = ParagraphStyle(
            "CustomH2",
            parent=styles["Heading2"],
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#34495e"),
            spaceAfter=10,
            spaceBefore=12,
            fontName="Helvetica-Bold"
        )
        
        # Body text style - justified, readable
        body_style = ParagraphStyle(
            "CustomBody",
            parent=styles["BodyText"],
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#333333"),
            alignment=TA_JUSTIFY,
            spaceAfter=8
        )
        
        # Metadata style - small, gray
        meta_style = ParagraphStyle(
            "CustomMeta",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#7f8c8d"),
            alignment=TA_CENTER
        )
        
        # Abstract style - italic, highlighted
        abstract_style = ParagraphStyle(
            "CustomAbstract",
            parent=styles["BodyText"],
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#2c3e50"),
            fontName="Helvetica-Oblique",
            leftIndent=20,
            rightIndent=20,
            spaceAfter=16
        )
        
        # Build PDF content
        story = []
        
        # Cover page
        story.append(Spacer(1, 1.5 * inch))
        story.append(Paragraph(html.escape(title), title_style))
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph(f"<i>{html.escape(artifact_type.replace('_', ' ').title())}</i>", meta_style))
        story.append(Spacer(1, 0.5 * inch))
        
        # Abstract box with border
        if abstract:
            story.append(Paragraph("<b>Abstract</b>", h2_style))
            story.append(Paragraph(html.escape(abstract), abstract_style))
            story.append(Spacer(1, 0.3 * inch))
        
        # Metadata section
        story.append(Paragraph(f"<b>Source:</b> {html.escape(source_path)}", meta_style))
        if commit_hash:
            story.append(Paragraph(f"<b>Commit:</b> {html.escape(commit_hash)}", meta_style))
        story.append(Spacer(1, 0.5 * inch))
        
        # Table of contents
        story.append(PageBreak())
        story.append(Paragraph("Table of Contents", h1_style))
        story.append(Spacer(1, 0.2 * inch))
        
        toc_entries = []
        for idx, section in enumerate(structured_json.get("sections", []), 1):
            heading = section.get("heading", "Section")
            toc_entries.append([f"{idx}.", html.escape(heading)])
        
        if toc_entries:
            toc_table = Table(toc_entries, colWidths=[0.5*inch, 5.5*inch])
            toc_table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor("#34495e")),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(toc_table)
        
        story.append(Spacer(1, 0.5 * inch))
        
        # Content sections
        story.append(PageBreak())
        
        for idx, section in enumerate(structured_json.get("sections", []), 1):
            heading = section.get("heading", "Section")
            content = section.get("content", "")
            section_type = section.get("type", "normal")
            
            # Section heading with number
            story.append(Paragraph(f"{idx}. {html.escape(heading)}", h1_style))
            
            # Section type badge (if not normal)
            if section_type != "normal":
                type_label = section_type.replace("_", " ").title()
                badge_style = ParagraphStyle(
                    "Badge",
                    parent=meta_style,
                    fontSize=8,
                    textColor=colors.white,
                    backColor=colors.HexColor("#3498db") if section_type == "task" else colors.HexColor("#27ae60"),
                    borderPadding=4,
                    alignment=TA_LEFT
                )
                story.append(Paragraph(f"<b>{html.escape(type_label)}</b>", badge_style))
                story.append(Spacer(1, 0.1 * inch))
            
            # Process content - handle lists and paragraphs
            if content:
                # Split into paragraphs
                paragraphs = content.split("\n\n")
                for para in paragraphs:
                    para = para.strip()
                    if not para:
                        continue
                    
                    # Handle lists
                    if para.startswith("- ") or para.startswith("* "):
                        list_items = []
                        for line in para.split("\n"):
                            if line.strip().startswith(("- ", "* ")):
                                item_text = line.strip()[2:].strip()
                                list_items.append(html.escape(item_text))
                        
                        if list_items:
                            for item in list_items:
                                story.append(Paragraph(f"• {item}", body_style))
                    else:
                        # Regular paragraph
                        story.append(Paragraph(html.escape(para), body_style))
                
                story.append(Spacer(1, 0.15 * inch))
        
        # Footer
        story.append(Spacer(1, 0.5 * inch))
        story.append(Paragraph("—" * 40, meta_style))
        story.append(Paragraph(f"Generated by Documentation Agent | {html.escape(source_path)}", meta_style))
        
        # Build PDF
        document = SimpleDocTemplate(
            str(output_path),
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
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
