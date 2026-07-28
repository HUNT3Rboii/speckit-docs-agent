from __future__ import annotations

import os
import html
import re
import base64
import hashlib
import requests
import subprocess
import logging
import time
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, ListFlowable, PageBreak, Table, TableStyle, Image
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
    Image = None


class RenderingService:
    def __init__(self, output_dir: str) -> None:
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self.logger = logging.getLogger(__name__)

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
        # Extract diagrams from structured JSON
        diagrams = structured_json.get("diagrams", [])
        
        # Process diagrams if present
        diagram_images = self._process_diagrams(diagrams, Path(self.output_dir)) if diagrams else {}
        
        # Build section-to-diagram mapping
        section_to_diagram = {}
        for diagram in diagrams:
            section_ref = diagram.get("section_ref")
            if section_ref:
                section_to_diagram[section_ref] = diagram.get("id", diagram.get("title"))
        
        sections = structured_json.get("sections", [])
        grouped_sections = self._group_sections(sections)
        section_html = ""
        toc_html = ""
        for group_name, items in grouped_sections.items():
            if not items:
                continue
            section_html += f"<h2>{group_name}</h2>"
            for section in items:
                heading = section.get('heading', '')
                section_html += f"<h3>{heading}</h3>"
                
                # Check for associated diagram and insert after heading
                if heading in section_to_diagram:
                    diagram_id = section_to_diagram[heading]
                    if diagram_id in diagram_images:
                        img_path = diagram_images[diagram_id]
                        # Check if image file exists
                        if img_path.exists():
                            # Use file:/// protocol for WeasyPrint compatibility
                            file_uri = img_path.as_uri()
                            section_html += f'<img src="{file_uri}" class="diagram-img" alt="{html.escape(diagram_id)}"/>'
                            self.logger.info(f"Embedded diagram {diagram_id} in section '{heading}' (WeasyPrint)")
                        else:
                            self.logger.warning(f"Diagram image not found at {img_path}, skipping")
                
                section_html += f"<p>{section.get('content', '')}</p>"
                toc_html += f"<li>{heading}</li>"
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
              .diagram-img {{ max-width: 100%; height: auto; margin: 20px 0; display: block; }}
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
        
        # Extract diagrams from structured JSON
        diagrams = structured_json.get("diagrams", [])
        
        # Process diagrams if present
        diagram_images = self._process_diagrams(diagrams, Path(self.output_dir)) if diagrams else {}
        
        # Build section-to-diagram mapping
        section_to_diagram = {}
        for diagram in diagrams:
            section_ref = diagram.get("section_ref")
            if section_ref:
                section_to_diagram[section_ref] = diagram.get("id", diagram.get("title"))
        
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
            
            # Check for associated diagram and insert after heading
            if heading in section_to_diagram:
                diagram_id = section_to_diagram[heading]
                if diagram_id in diagram_images:
                    img_path = diagram_images[diagram_id]
                    try:
                        # Create Image flowable with proportional sizing
                        img = Image(str(img_path), width=5*inch, height=3*inch, kind='proportional')
                        story.append(img)
                        story.append(Spacer(1, 0.2*inch))
                        self.logger.info(f"Embedded diagram {diagram_id} in section '{heading}'")
                    except Exception as e:
                        self.logger.error(f"Failed to load diagram image {img_path}: {e}")
                        # Continue without the diagram
            
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

    def _process_diagrams(self, diagrams: List[Dict], output_dir: Path) -> Dict[str, Path]:
        """
        Process a list of diagram specifications and convert them to images.
        
        Args:
            diagrams: List of diagram specifications with mermaid_code
            output_dir: Directory where diagram images will be saved
        
        Returns:
            Dictionary mapping diagram IDs to image file paths
        """
        diagram_images = {}
        
        if not diagrams:
            return diagram_images
        
        # Create output directory for diagram images
        diagram_img_dir = output_dir / "diagram_images"
        diagram_img_dir.mkdir(parents=True, exist_ok=True)
        
        for diagram in diagrams:
            # Extract diagram ID and Mermaid code
            diagram_id = diagram.get("id", diagram.get("title", ""))
            mermaid_code = diagram.get("mermaid_code")
            
            if not diagram_id:
                self.logger.warning("Diagram missing ID and title, skipping")
                continue
            
            if not mermaid_code or not mermaid_code.strip():
                self.logger.warning(f"Diagram {diagram_id} missing mermaid_code, skipping")
                continue
            
            # Convert Mermaid code to image
            try:
                img_path = self._convert_mermaid_to_image(mermaid_code, output_dir, diagram_id)
                
                if img_path and img_path.exists():
                    diagram_images[diagram_id] = img_path
                    self.logger.info(f"Successfully processed diagram {diagram_id}")
                else:
                    self.logger.warning(f"Failed to convert diagram {diagram_id}, skipping")
            except Exception as e:
                self.logger.error(f"Error processing diagram {diagram_id}: {e}", exc_info=True)
                # Continue processing remaining diagrams
                continue
        
        return diagram_images

    def _get_cached_diagram(self, mermaid_code: str, cache_dir: Path) -> Optional[Path]:
        """
        Check if a cached diagram exists for the given Mermaid code.
        
        Args:
            mermaid_code: The Mermaid diagram code to check
            cache_dir: Directory where cached diagrams are stored
        
        Returns:
            Path to cached diagram if exists and not stale (< 24 hours old), None otherwise
        """
        # Create cache directory if it doesn't exist
        cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate cache key using MD5 hash of mermaid code
        cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
        cached_file = cache_dir / f"{cache_key}.png"
        
        # Check if cached file exists
        if not cached_file.exists():
            return None
        
        # Check if file is stale (older than 24 hours)
        try:
            file_age = time.time() - cached_file.stat().st_mtime
            max_age = 24 * 60 * 60  # 24 hours in seconds
            
            if file_age > max_age:
                self.logger.info(f"Cached diagram {cache_key} is stale (age: {file_age / 3600:.1f} hours), will regenerate")
                return None
            
            self.logger.info(f"Using cached diagram {cache_key} (age: {file_age / 3600:.1f} hours)")
            return cached_file
        except Exception as e:
            self.logger.warning(f"Error checking cached diagram {cache_key}: {e}")
            return None

    def _convert_mermaid_to_image(self, mermaid_code: str, output_dir: Path, diagram_id: str) -> Optional[Path]:
        """
        Convert Mermaid code to an image file using a fallback chain.
        
        Primary method: Mermaid.ink API
        Fallback 1: Kroki API
        Fallback 2: Local Mermaid CLI (mmdc)
        
        Args:
            mermaid_code: The Mermaid diagram code to convert
            output_dir: Directory where diagram images are saved
            diagram_id: Unique identifier for the diagram
        
        Returns:
            Path to the saved image file on success, None on complete failure
        """
        if not mermaid_code or not mermaid_code.strip():
            self.logger.warning(f"Empty Mermaid code for diagram {diagram_id}, skipping conversion")
            return None
        
        # Create diagram images directory
        diagram_img_dir = output_dir / "diagram_images"
        diagram_img_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if diagram caching is enabled (default: True)
        cache_enabled = os.environ.get('DIAGRAM_CACHE_ENABLED', 'true').lower() in ('true', '1', 'yes')
        
        # Check cache before conversion
        if cache_enabled:
            cache_dir = output_dir / "diagram_cache"
            cached = self._get_cached_diagram(mermaid_code, cache_dir)
            if cached:
                # Copy cached file to output location with diagram_id as filename
                output_path = diagram_img_dir / f"{diagram_id}.png"
                try:
                    shutil.copy2(cached, output_path)
                    self.logger.info(f"Using cached diagram for {diagram_id}")
                    return output_path
                except Exception as e:
                    self.logger.warning(f"Failed to copy cached diagram: {e}, will regenerate")
        
        # Output path for the diagram
        output_path = diagram_img_dir / f"{diagram_id}.png"
        
        # Encode Mermaid code to base64 for API calls
        try:
            mermaid_bytes = mermaid_code.encode('utf-8')
            base64_encoded = base64.urlsafe_b64encode(mermaid_bytes).decode('utf-8')
        except Exception as e:
            self.logger.error(f"Failed to encode Mermaid code for diagram {diagram_id}: {e}")
            return None
        
        # Primary Method: Mermaid.ink API
        try:
            mermaid_ink_url = f"https://mermaid.ink/img/{base64_encoded}"
            response = requests.get(mermaid_ink_url, timeout=10)
            
            if response.status_code == 200 and response.content:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                
                # Save to cache if caching is enabled
                if cache_enabled:
                    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
                    cache_path = cache_dir / f"{cache_key}.png"
                    try:
                        shutil.copy2(output_path, cache_path)
                        self.logger.info(f"Cached diagram {diagram_id} with key {cache_key}")
                    except Exception as e:
                        self.logger.warning(f"Failed to cache diagram: {e}")
                
                self.logger.info(f"Successfully converted diagram {diagram_id} using Mermaid.ink")
                return output_path
            else:
                self.logger.warning(f"Mermaid.ink returned status {response.status_code} for diagram {diagram_id}")
        except requests.Timeout:
            self.logger.warning(f"Mermaid.ink API timeout for diagram {diagram_id}, trying Kroki...")
        except Exception as e:
            self.logger.warning(f"Mermaid.ink failed for diagram {diagram_id}: {e}, trying Kroki...")
        
        # Fallback 1: Kroki API
        try:
            kroki_url = f"https://kroki.io/mermaid/png/{base64_encoded}"
            response = requests.get(kroki_url, timeout=10)
            
            if response.status_code == 200 and response.content:
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                
                # Save to cache if caching is enabled
                if cache_enabled:
                    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
                    cache_path = cache_dir / f"{cache_key}.png"
                    try:
                        shutil.copy2(output_path, cache_path)
                        self.logger.info(f"Cached diagram {diagram_id} with key {cache_key}")
                    except Exception as e:
                        self.logger.warning(f"Failed to cache diagram: {e}")
                
                self.logger.info(f"Successfully converted diagram {diagram_id} using Kroki (fallback)")
                return output_path
            else:
                self.logger.warning(f"Kroki returned status {response.status_code} for diagram {diagram_id}")
        except requests.Timeout:
            self.logger.warning(f"Kroki API timeout for diagram {diagram_id}, trying local CLI...")
        except Exception as e:
            self.logger.warning(f"Kroki failed for diagram {diagram_id}: {e}, trying local CLI...")
        
        # Fallback 2: Local Mermaid CLI (mmdc)
        try:
            # Check if mmdc is available
            result = subprocess.run(['mmdc', '--version'], 
                                   capture_output=True, 
                                   text=True, 
                                   timeout=5)
            
            if result.returncode == 0:
                # Create temporary input file
                temp_input = diagram_img_dir / f"{diagram_id}_temp.mmd"
                with open(temp_input, 'w', encoding='utf-8') as f:
                    f.write(mermaid_code)
                
                # Run mmdc command
                result = subprocess.run(['mmdc', '-i', str(temp_input), '-o', str(output_path)],
                                       capture_output=True,
                                       text=True,
                                       timeout=30)
                
                # Clean up temporary file
                if temp_input.exists():
                    temp_input.unlink()
                
                if result.returncode == 0 and output_path.exists():
                    # Save to cache if caching is enabled
                    if cache_enabled:
                        cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
                        cache_path = cache_dir / f"{cache_key}.png"
                        try:
                            shutil.copy2(output_path, cache_path)
                            self.logger.info(f"Cached diagram {diagram_id} with key {cache_key}")
                        except Exception as e:
                            self.logger.warning(f"Failed to cache diagram: {e}")
                    
                    self.logger.info(f"Successfully converted diagram {diagram_id} using local Mermaid CLI (fallback)")
                    return output_path
                else:
                    self.logger.warning(f"Mermaid CLI failed for diagram {diagram_id}: {result.stderr}")
            else:
                self.logger.warning(f"Mermaid CLI (mmdc) not available for diagram {diagram_id}")
        except FileNotFoundError:
            self.logger.warning(f"Mermaid CLI (mmdc) not found in PATH for diagram {diagram_id}")
        except subprocess.TimeoutExpired:
            self.logger.warning(f"Mermaid CLI timeout for diagram {diagram_id}")
        except Exception as e:
            self.logger.warning(f"Local Mermaid CLI failed for diagram {diagram_id}: {e}")
        
        # All methods failed
        self.logger.error(f"All services failed for diagram {diagram_id}, skipping diagram")
        return None
