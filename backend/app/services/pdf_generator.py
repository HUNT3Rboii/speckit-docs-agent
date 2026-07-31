"""
PDFGeneratorService - Converts HTML to PDF using WeasyPrint with professional formatting.

This service handles the conversion of HTML documents to PDF with specific styling:
- 1-inch margins on all sides
- Page numbers in footers
- Preservation of hyperlinks and formatting
- Professional styling and layout

Requirements: 12.1, 12.4
"""

import logging
from pathlib import Path
from typing import Optional
from weasyprint import HTML, CSS


class PDFGeneratorService:
    """
    Service for generating PDFs from HTML using WeasyPrint.
    
    Features:
    - Configurable page margins (default: 1 inch on all sides)
    - Page numbering in footers
    - Hyperlink preservation
    - Professional CSS styling
    - Fallback handling for render failures
    """
    
    # 1 inch in CSS units (1 inch = 96px in standard CSS)
    MARGIN_INCH = "1in"
    
    def __init__(self, output_dir: Optional[str] = None):
        """
        Initialize PDFGeneratorService.
        
        Args:
            output_dir: Optional directory for storing generated PDFs.
                       If not provided, output_dir will be required in generate_pdf().
        """
        self.output_dir = output_dir
        self.logger = logging.getLogger(__name__)
    
    def configure_page_layout(self) -> dict:
        """
        Return page layout configuration for use in CSS.
        
        Returns:
            Dictionary with margin and page size configuration
        """
        return {
            "margin_top": self.MARGIN_INCH,
            "margin_right": self.MARGIN_INCH,
            "margin_bottom": self.MARGIN_INCH,
            "margin_left": self.MARGIN_INCH,
            "page_size": "A4",
        }
    
    def generate_pdf(self, html: str, output_path: str) -> bool:
        """
        Convert HTML to PDF using WeasyPrint.
        
        Features:
        - Applies 1-inch margins on all sides
        - Generates page numbers in footers
        - Preserves hyperlinks and formatting
        - Handles render failures gracefully
        
        Args:
            html: HTML string to convert to PDF
            output_path: File path where PDF should be saved
        
        Returns:
            True if PDF generation succeeded, False otherwise
        
        Raises:
            ValueError: If html is empty or output_path is invalid
        """
        if not html or not html.strip():
            self.logger.error("HTML content is empty")
            raise ValueError("HTML content cannot be empty")
        
        if not output_path:
            self.logger.error("Output path is required")
            raise ValueError("Output path cannot be empty")
        
        try:
            # Ensure output directory exists
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Create CSS with page layout, margins, and page numbers
            page_css = self._build_page_css()
            
            # Convert HTML to PDF
            pdf_bytes = HTML(string=html).write_pdf(
                stylesheets=[CSS(string=page_css)],
                optimize_images=True,
            )
            
            # Write PDF to file
            with open(output_file, 'wb') as f:
                f.write(pdf_bytes)
            
            self.logger.info(f"Successfully generated PDF: {output_path}")
            return True
        
        except ValueError as e:
            self.logger.error(f"ValueError during PDF generation: {e}")
            raise
        except Exception as e:
            self.logger.error(f"Failed to generate PDF: {e}", exc_info=True)
            return False
    
    def _build_page_css(self) -> str:
        """
        Build the page-geometry stylesheet: size, margins, and the
        page-number footer, plus a minimal hyperlink-color fallback.

        Deliberately does NOT define body/heading/paragraph/list/code/table
        typography. WeasyPrint applies stylesheets passed to write_pdf(...,
        stylesheets=[...]) after the HTML document's own inline <style>, so
        for equal-specificity selectors (bare `body`, `h1`, `h2`, `h3`, `p`,
        etc.) this stylesheet's rules win the cascade over the document's
        own styles. This file used to duplicate that typography with
        different values than HTMLGeneratorService.CSS_STYLES (e.g. h1:
        24pt here vs ~21pt there), which silently overrode the intended
        styling for shared selectors while HTMLGeneratorService's more
        specific class selectors (.cover-title, .section-task, etc.) still
        applied - producing visibly inconsistent heading/body sizing across
        the same document. All typography now lives solely in
        HTMLGeneratorService.CSS_STYLES; this stylesheet only contributes
        what that one doesn't define: @page geometry.

        Returns:
            CSS string with @page geometry and a hyperlink-color fallback
        """
        css = f"""
        @page {{
            /* Page size and margins */
            size: A4;
            margin-top: {self.MARGIN_INCH};
            margin-right: {self.MARGIN_INCH};
            margin-bottom: {self.MARGIN_INCH};
            margin-left: {self.MARGIN_INCH};

            /* Footer with page numbers */
            @bottom-center {{
                content: "Page " counter(page) " of " counter(pages);
                font-family: Arial, sans-serif;
                font-size: 10pt;
                color: #666;
                margin-top: 0.5in;
            }}
        }}

        /* Fallback hyperlink color for any anchor not covered by a more
           specific class (.toc-link/.glossary-link already set their own). */
        a {{
            color: #0066cc;
            text-decoration: underline;
            text-decoration-color: #0066cc;
        }}

        a:link {{
            color: #0066cc;
        }}

        a:visited {{
            color: #663366;
        }}
        """
        return css
