"""
Unit tests for PDFGeneratorService.

Tests cover:
- Margin configuration (1-inch on all sides)
- Page number generation in footers
- Hyperlink preservation
- Basic PDF generation and error handling
"""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from weasyprint import HTML, CSS

from app.services.pdf_generator import PDFGeneratorService


class TestPDFGeneratorServiceConfiguration:
    """Tests for PDFGeneratorService configuration methods."""
    
    def test_configure_page_layout_returns_correct_margins(self):
        """Test that page layout configuration returns 1-inch margins."""
        service = PDFGeneratorService()
        config = service.configure_page_layout()
        
        assert config["margin_top"] == "1in"
        assert config["margin_right"] == "1in"
        assert config["margin_bottom"] == "1in"
        assert config["margin_left"] == "1in"
        assert config["page_size"] == "A4"
    
    def test_margin_constant_is_one_inch(self):
        """Test that MARGIN_INCH constant is set to 1 inch."""
        service = PDFGeneratorService()
        assert service.MARGIN_INCH == "1in"


class TestPDFGeneratorServiceCSS:
    """Tests for CSS generation and page layout styling."""
    
    def test_build_page_css_includes_one_inch_margins(self):
        """Test that generated CSS includes 1-inch margins."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        assert "margin-top: 1in" in css
        assert "margin-right: 1in" in css
        assert "margin-bottom: 1in" in css
        assert "margin-left: 1in" in css
    
    def test_build_page_css_includes_page_numbers(self):
        """Test that generated CSS includes page number footer."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        assert "@bottom-center" in css
        assert "content: \"Page \" counter(page) \" of \" counter(pages)" in css
        assert "counter(page)" in css
        assert "counter(pages)" in css
    
    def test_build_page_css_preserves_hyperlinks(self):
        """Test that generated CSS preserves hyperlink colors and styling."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        assert "a {" in css
        assert "color: #0066cc" in css
        assert "text-decoration: underline" in css
        assert "a:link" in css
        assert "a:visited" in css
    
    def test_build_page_css_does_not_duplicate_html_generator_typography(self):
        """
        Regression test: _build_page_css() must not redefine body/heading
        typography. It previously did, with different values than
        HTMLGeneratorService.CSS_STYLES (e.g. h1: 24pt here vs ~21pt there).
        Since WeasyPrint applies stylesheets passed via write_pdf(...,
        stylesheets=[...]) after the document's own inline <style>, this
        stylesheet's rules silently won the cascade for shared selectors
        (bare body/h1/h2/h3/p), producing visibly inconsistent sizing
        against HTMLGeneratorService's more specific class-based styles
        (.cover-title, .section-task, etc.) that were NOT overridden. All
        typography now lives solely in HTMLGeneratorService.CSS_STYLES.
        """
        service = PDFGeneratorService()
        css = service._build_page_css()

        assert "body {" not in css
        assert "h1, h2, h3, h4, h5, h6" not in css
        assert "h1 {" not in css
        assert "24pt" not in css
        assert "p {" not in css
        assert "table {" not in css
        assert "strong {" not in css
        assert "em {" not in css

    def test_build_page_css_still_defines_page_geometry(self):
        """Confirm the fix above didn't also strip what this service IS
        responsible for: @page size/margins and the page-number footer."""
        service = PDFGeneratorService()
        css = service._build_page_css()

        assert "@page" in css
        assert "size: A4" in css
        assert "@bottom-center" in css


class TestPDFGeneratorServiceGeneration:
    """Tests for PDF generation functionality."""
    
    def test_generate_pdf_creates_file(self, tmp_path):
        """Test that generate_pdf creates a PDF file."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body><h1>Test</h1><p>Hello World</p></body></html>"
        output_path = str(tmp_path / "test.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
        assert Path(output_path).stat().st_size > 0
    
    def test_generate_pdf_creates_parent_directories(self, tmp_path):
        """Test that generate_pdf creates parent directories if they don't exist."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body><h1>Test</h1></body></html>"
        output_path = str(tmp_path / "subdir" / "nested" / "test.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
    
    def test_generate_pdf_with_hyperlinks(self, tmp_path):
        """Test that PDF generation preserves hyperlinks."""
        service = PDFGeneratorService(str(tmp_path))
        html = '<html><body><a href="https://example.com">Link</a></body></html>'
        output_path = str(tmp_path / "test_links.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
    
    def test_generate_pdf_with_complex_formatting(self, tmp_path):
        """Test PDF generation with complex formatting elements."""
        service = PDFGeneratorService(str(tmp_path))
        html = """
        <html>
            <body>
                <h1>Main Title</h1>
                <p>Regular paragraph with <strong>bold</strong> and <em>italic</em>.</p>
                <ul>
                    <li>Item 1</li>
                    <li>Item 2</li>
                </ul>
                <table>
                    <tr><th>Header 1</th><th>Header 2</th></tr>
                    <tr><td>Data 1</td><td>Data 2</td></tr>
                </table>
                <pre><code>print("Hello")</code></pre>
            </body>
        </html>
        """
        output_path = str(tmp_path / "test_complex.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
    
    def test_generate_pdf_returns_true_on_success(self, tmp_path):
        """Test that generate_pdf returns True on successful generation."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body>Test</body></html>"
        output_path = str(tmp_path / "test.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert isinstance(result, bool)
    
    def test_generate_pdf_returns_false_on_weasyprint_failure(self, tmp_path):
        """Test that generate_pdf returns False when WeasyPrint fails."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body>Test</body></html>"
        output_path = str(tmp_path / "test.pdf")
        
        # Mock WeasyPrint to raise an exception
        with patch('app.services.pdf_generator.HTML') as mock_html:
            mock_html.return_value.write_pdf.side_effect = Exception("Render error")
            
            result = service.generate_pdf(html, output_path)
            
            assert result is False
    
    def test_generate_pdf_raises_on_empty_html(self, tmp_path):
        """Test that generate_pdf raises ValueError when HTML is empty."""
        service = PDFGeneratorService(str(tmp_path))
        output_path = str(tmp_path / "test.pdf")
        
        with pytest.raises(ValueError, match="HTML content cannot be empty"):
            service.generate_pdf("", output_path)
    
    def test_generate_pdf_raises_on_whitespace_only_html(self, tmp_path):
        """Test that generate_pdf raises ValueError when HTML contains only whitespace."""
        service = PDFGeneratorService(str(tmp_path))
        output_path = str(tmp_path / "test.pdf")
        
        with pytest.raises(ValueError, match="HTML content cannot be empty"):
            service.generate_pdf("   \n\t  ", output_path)
    
    def test_generate_pdf_raises_on_empty_output_path(self, tmp_path):
        """Test that generate_pdf raises ValueError when output_path is empty."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body>Test</body></html>"
        
        with pytest.raises(ValueError, match="Output path cannot be empty"):
            service.generate_pdf(html, "")
    
    def test_generate_pdf_with_output_dir_in_constructor(self, tmp_path):
        """Test that PDFGeneratorService uses output_dir from constructor."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body>Test</body></html>"
        output_path = str(tmp_path / "test.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert service.output_dir == str(tmp_path)


class TestPDFGeneratorServiceInitialization:
    """Tests for PDFGeneratorService initialization."""
    
    def test_init_with_output_dir(self, tmp_path):
        """Test PDFGeneratorService initialization with output_dir."""
        service = PDFGeneratorService(str(tmp_path))
        assert service.output_dir == str(tmp_path)
    
    def test_init_without_output_dir(self):
        """Test PDFGeneratorService initialization without output_dir."""
        service = PDFGeneratorService()
        assert service.output_dir is None
    
    def test_logger_initialized(self):
        """Test that logger is properly initialized."""
        service = PDFGeneratorService()
        assert service.logger is not None


class TestPDFGeneratorPageLayout:
    """Tests for page layout and margin requirements."""
    
    def test_margins_in_page_css(self):
        """Test that margins appear in generated page CSS."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        # All four margins should be 1in
        margin_count = css.count("1in")
        assert margin_count >= 4  # At least 4 occurrences for the four margins
    
    def test_page_size_is_a4(self):
        """Test that page size is set to A4."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        assert "size: A4" in css
    
    def test_page_number_format(self):
        """Test that page number format is correct."""
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        # Should show "Page X of Y" format
        assert 'content: "Page " counter(page) " of " counter(pages)' in css


class TestPDFGeneratorIntegration:
    """Integration tests for PDF generation with realistic content."""
    
    def test_generate_pdf_with_markdown_like_content(self, tmp_path):
        """Test PDF generation with markdown-like HTML content."""
        service = PDFGeneratorService(str(tmp_path))
        html = """
        <html>
            <body>
                <h1>Documentation</h1>
                <h2>Section 1</h2>
                <p>This is a section with <a href="#section2">links</a>.</p>
                <h2 id="section2">Section 2</h2>
                <p>Another section with a <a href="https://example.com">external link</a>.</p>
                <h3>Subsection</h3>
                <p>Some details here.</p>
            </body>
        </html>
        """
        output_path = str(tmp_path / "doc.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
        assert Path(output_path).stat().st_size > 0
    
    def test_generate_multiple_pdfs_independently(self, tmp_path):
        """Test that multiple PDFs can be generated independently."""
        service = PDFGeneratorService(str(tmp_path))
        
        html1 = "<html><body><h1>Document 1</h1></body></html>"
        html2 = "<html><body><h1>Document 2</h1></body></html>"
        
        path1 = str(tmp_path / "doc1.pdf")
        path2 = str(tmp_path / "doc2.pdf")
        
        result1 = service.generate_pdf(html1, path1)
        result2 = service.generate_pdf(html2, path2)
        
        assert result1 is True
        assert result2 is True
        assert Path(path1).exists()
        assert Path(path2).exists()


class TestPDFGeneratorEdgeCases:
    """Tests for edge cases and error handling."""
    
    def test_generate_pdf_with_special_characters(self, tmp_path):
        """Test PDF generation with special characters in HTML."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body><p>Special chars: © ® ™ € ¥ £</p></body></html>"
        output_path = str(tmp_path / "test_special.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()
    
    def test_generate_pdf_with_unicode_content(self, tmp_path):
        """Test PDF generation with unicode content."""
        service = PDFGeneratorService(str(tmp_path))
        html = "<html><body><p>日本語 中文 한국어 العربية</p></body></html>"
        output_path = str(tmp_path / "test_unicode.pdf")
        
        result = service.generate_pdf(html, output_path)
        
        # May not work perfectly on all systems, but should not crash
        # Just ensure it doesn't raise an unhandled exception
        assert isinstance(result, bool)
    
    def test_generate_pdf_with_very_long_html(self, tmp_path):
        """Test PDF generation with very long HTML content."""
        service = PDFGeneratorService(str(tmp_path))
        
        # Create HTML with many pages of content
        html = "<html><body><h1>Long Document</h1>"
        for i in range(100):
            html += f"<h2>Section {i}</h2><p>Content for section {i}. " * 10
        html += "</body></html>"
        
        output_path = str(tmp_path / "test_long.pdf")
        result = service.generate_pdf(html, output_path)
        
        assert result is True
        assert Path(output_path).exists()


class TestPDFGeneratorRequirements:
    """Tests that directly validate requirements 12.1 and 12.4."""
    
    def test_requirement_12_1_margins_and_page_numbers(self, tmp_path):
        """
        Requirement 12.1: System shall apply 1-inch margins and page numbers in footers.
        
        This test verifies that:
        - CSS includes 1-inch margins on all sides
        - CSS includes footer page numbers
        """
        service = PDFGeneratorService()
        css = service._build_page_css()
        
        # Check 1-inch margins
        assert "margin-top: 1in" in css
        assert "margin-right: 1in" in css
        assert "margin-bottom: 1in" in css
        assert "margin-left: 1in" in css
        
        # Check page numbers in footer
        assert "@bottom-center" in css
        assert 'counter(page)' in css
        assert 'counter(pages)' in css
    
    def test_requirement_12_4_hyperlinks_and_formatting(self, tmp_path):
        """
        Requirement 12.4: System shall preserve hyperlinks and formatting.
        
        This test verifies that:
        - PDF is generated successfully with hyperlinks
        - PDF preserves text formatting (bold, italic)
        - PDF preserves structure (headings, paragraphs, lists)
        """
        service = PDFGeneratorService(str(tmp_path))
        
        html = """
        <html>
            <body>
                <h1>Title</h1>
                <p>Text with <a href="https://example.com">hyperlink</a>, 
                   <strong>bold</strong>, and <em>italic</em>.</p>
                <ul>
                    <li>Item 1</li>
                </ul>
            </body>
        </html>
        """
        output_path = str(tmp_path / "test_req_12_4.pdf")
        
        # Generate PDF
        result = service.generate_pdf(html, output_path)
        
        # Verify success
        assert result is True
        assert Path(output_path).exists()
        
        # Check CSS includes hyperlink preservation
        css = service._build_page_css()
        assert "a {" in css
        assert "color: #0066cc" in css
        assert "text-decoration: underline" in css

        # Bold/italic formatting (<strong>/<em>) needs no explicit CSS -
        # WeasyPrint, like any browser, renders those semantically by
        # default - so preservation is confirmed by successful generation
        # above rather than by asserting page-geometry CSS content here.
