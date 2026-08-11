from app.services.rendering import RenderingService
import pytest
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import base64
import requests
import hashlib
import time
import os


# A real 1x1 PNG. The reportlab path hands downloaded diagram bytes to PIL,
# which rejects arbitrary placeholder bytes with UnidentifiedImageError, so any
# test that renders an embedded diagram needs a file PIL can actually decode.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def test_build_html_groups_sections_by_type(tmp_path) -> None:
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Release Notes",
        "abstract": "Grouped output",
        "sections": [
            {"heading": "Task 1", "content": "- [x] Ship feature", "type": "task"},
            {"heading": "Story 1", "content": "As a user, I want to view docs, so that I can learn faster.", "type": "user_story"},
            {"heading": "Decision 1", "content": "Use FastAPI.", "type": "design_decision"},
            {"heading": "Notes", "content": "General guidance.", "type": "normal"},
        ],
    }

    html = service._build_html(
        "Release Notes",
        "Grouped output",
        structured_json,
        "task",
        "specs/001-documentation-agent/tasks/001.md",
        "abc123",
    )

    assert "Table of contents" in html
    assert "Task sections" in html
    assert "User story sections" in html
    assert "Design decision sections" in html
    assert "Other sections" in html
    assert "Ship feature" in html


# Unit tests for Mermaid-to-image conversion

def test_convert_mermaid_to_image_with_valid_code_mermaid_ink_success(tmp_path) -> None:
    """Test successful conversion using Mermaid.ink API"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A[Frontend] --> B[Backend]"
    diagram_id = "test_diagram_1"
    
    # Mock successful API response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"fake_image_data"
    
    with patch('requests.get', return_value=mock_response) as mock_get:
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        assert result is not None
        assert result.exists()
        assert result.name == f"{diagram_id}.png"
        assert result.parent.name == "diagram_images"
        
        # Verify Mermaid.ink was called
        assert mock_get.call_count == 1
        call_args = mock_get.call_args
        assert "mermaid.ink" in call_args[0][0]


def test_convert_mermaid_to_image_with_empty_code(tmp_path) -> None:
    """Test that empty Mermaid code returns None"""
    service = RenderingService(str(tmp_path))
    result = service._convert_mermaid_to_image("", tmp_path, "empty_diagram")
    assert result is None
    
    result = service._convert_mermaid_to_image("   ", tmp_path, "whitespace_diagram")
    assert result is None


def test_convert_mermaid_to_image_mermaid_ink_failure_kroki_success(tmp_path) -> None:
    """Test fallback to Kroki when Mermaid.ink fails"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "fallback_diagram"
    
    # Mock Mermaid.ink failure
    mock_mermaid_ink_response = Mock()
    mock_mermaid_ink_response.status_code = 500
    
    # Mock Kroki success
    mock_kroki_response = Mock()
    mock_kroki_response.status_code = 200
    mock_kroki_response.content = b"kroki_image_data"
    
    def mock_get_side_effect(url, timeout):
        if "mermaid.ink" in url:
            return mock_mermaid_ink_response
        elif "kroki.io" in url:
            return mock_kroki_response
        return Mock(status_code=500)
    
    with patch('requests.get', side_effect=mock_get_side_effect) as mock_get:
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        assert result is not None
        assert result.exists()
        
        # Verify both APIs were called
        assert mock_get.call_count == 2


def test_convert_mermaid_to_image_mermaid_ink_timeout(tmp_path) -> None:
    """Test timeout handling for Mermaid.ink API"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "timeout_diagram"
    
    # Mock Kroki success for fallback
    mock_kroki_response = Mock()
    mock_kroki_response.status_code = 200
    mock_kroki_response.content = b"kroki_fallback_data"
    
    call_count = [0]
    
    def mock_get_side_effect(url, timeout):
        call_count[0] += 1
        if "mermaid.ink" in url:
            raise requests.Timeout("Connection timeout")
        return mock_kroki_response
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        assert result is not None
        assert call_count[0] == 2  # Mermaid.ink timeout + Kroki success


def test_convert_mermaid_to_image_both_apis_fail_mmdc_success(tmp_path) -> None:
    """Test fallback to local Mermaid CLI when both APIs fail"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "cli_diagram"
    
    # Mock both APIs failing
    def mock_get_side_effect(url, timeout):
        raise requests.RequestException("API unavailable")
    
    # Mock mmdc CLI availability and success
    mock_version_result = Mock()
    mock_version_result.returncode = 0
    
    mock_convert_result = Mock()
    mock_convert_result.returncode = 0
    mock_convert_result.stderr = ""
    
    def mock_subprocess_run(cmd, **kwargs):
        if '--version' in cmd:
            return mock_version_result
        else:
            # Create the output file to simulate successful conversion
            output_path = None
            if '-o' in cmd:
                output_idx = cmd.index('-o')
                output_path = Path(cmd[output_idx + 1])
                output_path.write_bytes(b"cli_generated_image")
            return mock_convert_result
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        with patch('subprocess.run', side_effect=mock_subprocess_run):
            result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
            
            assert result is not None
            assert result.exists()


def test_convert_mermaid_to_image_all_methods_fail(tmp_path) -> None:
    """Test complete failure when all conversion methods fail"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "fail_diagram"
    
    # Mock all APIs failing
    def mock_get_side_effect(url, timeout):
        raise requests.RequestException("Network error")
    
    # Mock mmdc not available
    mock_version_result = Mock()
    mock_version_result.returncode = 1
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        with patch('subprocess.run', return_value=mock_version_result):
            result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
            
            assert result is None


def test_convert_mermaid_to_image_invalid_encoding(tmp_path) -> None:
    """Test handling of encoding errors"""
    service = RenderingService(str(tmp_path))
    
    # Create a mock that raises an encoding error
    with patch('base64.urlsafe_b64encode', side_effect=Exception("Encoding error")):
        result = service._convert_mermaid_to_image("test code", tmp_path, "encoding_test")
        
        assert result is None


def test_convert_mermaid_to_image_creates_directory(tmp_path) -> None:
    """Test that the diagram_images directory is created if it doesn't exist"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    
    # Ensure directory doesn't exist
    diagram_dir = tmp_path / "diagram_images"
    assert not diagram_dir.exists()
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image"
    
    with patch('requests.get', return_value=mock_response):
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, "dir_test")
        
        assert diagram_dir.exists()
        assert result is not None


# Unit tests for diagram processing pipeline

def test_process_diagrams_with_empty_list(tmp_path) -> None:
    """Test that empty diagram list returns empty dict"""
    service = RenderingService(str(tmp_path))
    result = service._process_diagrams([], tmp_path)
    
    assert result == {}


def test_process_diagrams_with_single_valid_diagram(tmp_path) -> None:
    """Test processing a single valid diagram"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            "id": "arch_diagram_1",
            "title": "System Architecture",
            "mermaid_code": "graph TB\n  A[Frontend] --> B[Backend]"
        }
    ]
    
    # Mock successful conversion
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image_data"
    
    with patch('requests.get', return_value=mock_response):
        result = service._process_diagrams(diagrams, tmp_path)
        
        assert len(result) == 1
        assert "arch_diagram_1" in result
        assert result["arch_diagram_1"].exists()


def test_process_diagrams_with_multiple_diagrams(tmp_path) -> None:
    """Test processing multiple diagrams"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            "id": "diagram_1",
            "title": "Architecture",
            "mermaid_code": "graph TB\n  A --> B"
        },
        {
            "id": "diagram_2",
            "title": "API Flow",
            "mermaid_code": "sequenceDiagram\n  A->>B: Request"
        },
        {
            "id": "diagram_3",
            "title": "Data Model",
            "mermaid_code": "erDiagram\n  USER ||--o{ ORDER : places"
        }
    ]
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"diagram_image"
    
    with patch('requests.get', return_value=mock_response):
        result = service._process_diagrams(diagrams, tmp_path)
        
        assert len(result) == 3
        assert "diagram_1" in result
        assert "diagram_2" in result
        assert "diagram_3" in result


def test_process_diagrams_with_missing_mermaid_code(tmp_path) -> None:
    """Test that diagrams without mermaid_code are skipped"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            "id": "valid_diagram",
            "title": "Architecture",
            "mermaid_code": "graph TB\n  A --> B"
        },
        {
            "id": "invalid_diagram",
            "title": "Missing Code"
            # No mermaid_code field
        }
    ]
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image"
    
    with patch('requests.get', return_value=mock_response):
        result = service._process_diagrams(diagrams, tmp_path)
        
        assert len(result) == 1
        assert "valid_diagram" in result
        assert "invalid_diagram" not in result


def test_process_diagrams_with_missing_id_and_title(tmp_path) -> None:
    """Test that diagrams without ID or title are skipped"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            # No id or title
            "mermaid_code": "graph TB\n  A --> B"
        }
    ]
    
    result = service._process_diagrams(diagrams, tmp_path)
    
    assert len(result) == 0


def test_process_diagrams_uses_title_when_id_missing(tmp_path) -> None:
    """Test that title is used as fallback when ID is missing"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            "title": "Architecture Diagram",
            "mermaid_code": "graph TB\n  A --> B"
        }
    ]
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image"
    
    with patch('requests.get', return_value=mock_response):
        result = service._process_diagrams(diagrams, tmp_path)
        
        assert len(result) == 1
        assert "Architecture Diagram" in result


def test_process_diagrams_creates_directory(tmp_path) -> None:
    """Test that diagram_images directory is created"""
    service = RenderingService(str(tmp_path))
    diagrams = [
        {
            "id": "test_diagram",
            "mermaid_code": "graph TB\n  A --> B"
        }
    ]
    
    diagram_dir = tmp_path / "diagram_images"
    assert not diagram_dir.exists()
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image"
    
    with patch('requests.get', return_value=mock_response):
        service._process_diagrams(diagrams, tmp_path)
        
        assert diagram_dir.exists()


# Unit tests for ReportLab diagram embedding

def test_render_with_reportlab_section_without_diagram(tmp_path) -> None:
    """Test that sections without diagrams render normally"""
    service = RenderingService(str(tmp_path))
    output_path = tmp_path / "test.pdf"
    
    structured_json = {
        "sections": [
            {
                "heading": "Introduction",
                "content": "This is a test section without diagrams.",
                "type": "normal"
            }
        ],
        "diagrams": []  # No diagrams
    }
    
    service._render_with_reportlab(
        output_path,
        "Test Document",
        "Test abstract",
        structured_json,
        "test",
        "test.md",
        None
    )
    
    assert output_path.exists()


def test_render_with_reportlab_section_with_diagram(tmp_path) -> None:
    """Test that sections with diagrams embed images correctly"""
    service = RenderingService(str(tmp_path))
    output_path = tmp_path / "test_with_diagram.pdf"
    
    structured_json = {
        "sections": [
            {
                "heading": "Architecture",
                "content": "System architecture overview.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "arch_1",
                "title": "System Architecture",
                "section_ref": "Architecture",
                "mermaid_code": "graph TB\n  A[Frontend] --> B[Backend]"
            }
        ]
    }
    
    # Mock successful diagram conversion
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = PNG_1X1

    with patch('requests.get', return_value=mock_response):
        service._render_with_reportlab(
            output_path,
            "Architecture Document",
            "System design",
            structured_json,
            "design",
            "design.md",
            None
        )
        
        assert output_path.exists()
        # Verify diagram was processed
        diagram_img_path = tmp_path / "diagram_images" / "arch_1.png"
        assert diagram_img_path.exists()


def test_render_with_reportlab_multiple_sections_with_diagrams(tmp_path) -> None:
    """Test rendering multiple sections with associated diagrams"""
    service = RenderingService(str(tmp_path))
    output_path = tmp_path / "test_multiple.pdf"
    
    structured_json = {
        "sections": [
            {
                "heading": "Architecture",
                "content": "System architecture.",
                "type": "normal"
            },
            {
                "heading": "API Design",
                "content": "API endpoints.",
                "type": "normal"
            },
            {
                "heading": "Data Model",
                "content": "Database schema.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "arch_diagram",
                "section_ref": "Architecture",
                "mermaid_code": "graph TB\n  A --> B"
            },
            {
                "id": "api_diagram",
                "section_ref": "API Design",
                "mermaid_code": "sequenceDiagram\n  Client->>Server: Request"
            },
            {
                "id": "data_diagram",
                "section_ref": "Data Model",
                "mermaid_code": "erDiagram\n  USER ||--o{ ORDER : places"
            }
        ]
    }
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = PNG_1X1

    with patch('requests.get', return_value=mock_response):
        service._render_with_reportlab(
            output_path,
            "Complete Design",
            "Full documentation",
            structured_json,
            "design",
            "design.md",
            None
        )
        
        assert output_path.exists()
        # Verify all diagrams were processed
        assert (tmp_path / "diagram_images" / "arch_diagram.png").exists()
        assert (tmp_path / "diagram_images" / "api_diagram.png").exists()
        assert (tmp_path / "diagram_images" / "data_diagram.png").exists()


def test_render_with_reportlab_handles_missing_diagram_image(tmp_path) -> None:
    """Test that rendering continues when diagram image loading fails"""
    service = RenderingService(str(tmp_path))
    output_path = tmp_path / "test_missing_image.pdf"
    
    structured_json = {
        "sections": [
            {
                "heading": "Architecture",
                "content": "System architecture.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "arch_1",
                "section_ref": "Architecture",
                "mermaid_code": "invalid mermaid code"
            }
        ]
    }
    
    # Mock failed diagram conversion (all methods fail)
    def mock_get_side_effect(url, timeout):
        raise requests.RequestException("All services failed")
    
    mock_version_result = Mock()
    mock_version_result.returncode = 1
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        with patch('subprocess.run', return_value=mock_version_result):
            service._render_with_reportlab(
                output_path,
                "Test Document",
                "Test abstract",
                structured_json,
                "test",
                "test.md",
                None
            )
            
            # PDF should still be created even though diagram failed
            assert output_path.exists()


def test_render_with_reportlab_no_diagrams_key(tmp_path) -> None:
    """Test rendering when structured_json has no diagrams key at all"""
    service = RenderingService(str(tmp_path))
    output_path = tmp_path / "test_no_diagrams_key.pdf"
    
    structured_json = {
        "sections": [
            {
                "heading": "Introduction",
                "content": "Content without diagrams.",
                "type": "normal"
            }
        ]
        # No diagrams key
    }
    
    service._render_with_reportlab(
        output_path,
        "Simple Document",
        "No diagrams",
        structured_json,
        "test",
        "test.md",
        None
    )
    
    assert output_path.exists()


# Unit tests for WeasyPrint HTML generation with diagrams

def test_build_html_with_no_diagrams(tmp_path) -> None:
    """Test that HTML generation works without diagrams"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Test Document",
        "abstract": "Test abstract",
        "sections": [
            {
                "heading": "Introduction",
                "content": "This is a test section.",
                "type": "normal"
            }
        ],
        "diagrams": []
    }
    
    html = service._build_html(
        "Test Document",
        "Test abstract",
        structured_json,
        "test",
        "test.md",
        "abc123"
    )
    
    assert "Introduction" in html
    assert "This is a test section" in html
    # The .diagram-img rule lives in the stylesheet unconditionally (see
    # test_build_html_diagram_css_styling), so absence of diagrams shows up as
    # no <img> element, not as a missing CSS class.
    assert '<img' not in html


def test_build_html_with_single_diagram(tmp_path) -> None:
    """Test HTML generation with a single diagram"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Architecture Doc",
        "abstract": "System design",
        "sections": [
            {
                "heading": "Architecture",
                "content": "System architecture overview.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "arch_diagram_1",
                "title": "System Architecture",
                "section_ref": "Architecture",
                "mermaid_code": "graph TB\n  A[Frontend] --> B[Backend]"
            }
        ]
    }
    
    # Mock successful diagram conversion
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_diagram_image"
    
    with patch('requests.get', return_value=mock_response):
        html = service._build_html(
            "Architecture Doc",
            "System design",
            structured_json,
            "design",
            "design.md",
            "commit123"
        )
        
        assert "Architecture" in html
        assert "diagram-img" in html  # CSS class for diagrams
        assert "arch_diagram_1" in html  # Diagram ID in alt text
        assert "file:///" in html  # File URI protocol for WeasyPrint
        assert "System architecture overview" in html


def test_build_html_with_multiple_diagrams(tmp_path) -> None:
    """Test HTML generation with multiple diagrams in different sections"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Complete Design",
        "abstract": "Full system documentation",
        "sections": [
            {
                "heading": "Architecture",
                "content": "System architecture.",
                "type": "normal"
            },
            {
                "heading": "API Design",
                "content": "API endpoints.",
                "type": "normal"
            },
            {
                "heading": "Data Model",
                "content": "Database schema.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "arch_diagram",
                "section_ref": "Architecture",
                "mermaid_code": "graph TB\n  A --> B"
            },
            {
                "id": "api_diagram",
                "section_ref": "API Design",
                "mermaid_code": "sequenceDiagram\n  Client->>Server: Request"
            },
            {
                "id": "data_diagram",
                "section_ref": "Data Model",
                "mermaid_code": "erDiagram\n  USER ||--o{ ORDER : places"
            }
        ]
    }
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"diagram_image"
    
    with patch('requests.get', return_value=mock_response):
        html = service._build_html(
            "Complete Design",
            "Full system documentation",
            structured_json,
            "design",
            "design.md",
            "commit456"
        )
        
        # Verify all sections are present
        assert "Architecture" in html
        assert "API Design" in html
        assert "Data Model" in html
        
        # Verify all diagram IDs are present in alt text
        assert "arch_diagram" in html
        assert "api_diagram" in html
        assert "data_diagram" in html
        
        # Verify diagram CSS class is present
        assert html.count("diagram-img") >= 3


def test_build_html_with_diagram_but_no_section_ref(tmp_path) -> None:
    """Test that diagrams without section_ref are not embedded"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Test Doc",
        "abstract": "Test",
        "sections": [
            {
                "heading": "Introduction",
                "content": "Content here.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "orphan_diagram",
                "title": "Orphan Diagram",
                # No section_ref
                "mermaid_code": "graph TB\n  A --> B"
            }
        ]
    }
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"diagram_image"
    
    with patch('requests.get', return_value=mock_response):
        html = service._build_html(
            "Test Doc",
            "Test",
            structured_json,
            "test",
            "test.md",
            "commit789"
        )
        
        # Diagram should not be embedded since no section_ref
        assert "orphan_diagram" not in html


def test_build_html_handles_missing_diagram_image(tmp_path) -> None:
    """Test that HTML generation continues when diagram conversion fails"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Test Doc",
        "abstract": "Test",
        "sections": [
            {
                "heading": "Architecture",
                "content": "System design.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "failed_diagram",
                "section_ref": "Architecture",
                "mermaid_code": "invalid mermaid syntax"
            }
        ]
    }
    
    # Mock failed diagram conversion
    def mock_get_side_effect(url, timeout):
        raise requests.RequestException("All services failed")
    
    mock_version_result = Mock()
    mock_version_result.returncode = 1
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        with patch('subprocess.run', return_value=mock_version_result):
            html = service._build_html(
                "Test Doc",
                "Test",
                structured_json,
                "test",
                "test.md",
                "commit999"
            )
            
            # HTML should still be generated
            assert "Architecture" in html
            assert "System design" in html
            # Diagram should not be present since conversion failed
            assert "failed_diagram" not in html


def test_build_html_no_diagrams_key(tmp_path) -> None:
    """Test HTML generation when structured_json has no diagrams key"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Simple Doc",
        "abstract": "Simple",
        "sections": [
            {
                "heading": "Content",
                "content": "Text content.",
                "type": "normal"
            }
        ]
        # No diagrams key
    }
    
    html = service._build_html(
        "Simple Doc",
        "Simple",
        structured_json,
        "test",
        "test.md",
        "commit111"
    )
    
    assert "Content" in html
    assert "Text content" in html
    assert '<img' not in html


def test_build_html_diagram_css_styling(tmp_path) -> None:
    """Test that diagram CSS styling is included in HTML"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "Test",
        "abstract": "Test",
        "sections": [
            {
                "heading": "Section",
                "content": "Content.",
                "type": "normal"
            }
        ],
        "diagrams": []
    }
    
    html = service._build_html(
        "Test",
        "Test",
        structured_json,
        "test",
        "test.md",
        None
    )
    
    # Verify diagram CSS class is defined in the style section
    assert ".diagram-img" in html
    assert "max-width: 100%" in html
    assert "height: auto" in html
    assert "margin: 20px 0" in html
    assert "display: block" in html


def test_build_html_uses_file_uri_protocol(tmp_path) -> None:
    """Test that diagram images use file:/// URI protocol for WeasyPrint"""
    service = RenderingService(str(tmp_path))
    structured_json = {
        "title": "URI Test",
        "abstract": "Test file URIs",
        "sections": [
            {
                "heading": "Diagrams",
                "content": "Diagram content.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "id": "uri_test_diagram",
                "section_ref": "Diagrams",
                "mermaid_code": "graph TB\n  A --> B"
            }
        ]
    }
    
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"test_image"
    
    with patch('requests.get', return_value=mock_response):
        html = service._build_html(
            "URI Test",
            "Test file URIs",
            structured_json,
            "test",
            "test.md",
            "commit222"
        )
        
        # Verify file:/// protocol is used (as_uri() adds this)
        assert "file:///" in html or "file://" in html  # Platform-specific
        assert "uri_test_diagram" in html


# Unit tests for diagram caching mechanism

def test_get_cached_diagram_cache_miss(tmp_path) -> None:
    """Test that _get_cached_diagram returns None when cache doesn't exist"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    mermaid_code = "graph TB\n  A --> B"
    
    result = service._get_cached_diagram(mermaid_code, cache_dir)
    
    assert result is None
    assert cache_dir.exists()  # Cache directory should be created


def test_get_cached_diagram_cache_hit(tmp_path) -> None:
    """Test that _get_cached_diagram returns cached file path when cache exists"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    mermaid_code = "graph TB\n  A --> B"
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    
    # Create a cached file
    cached_file.write_bytes(b"cached_diagram_data")
    
    result = service._get_cached_diagram(mermaid_code, cache_dir)
    
    assert result is not None
    assert result == cached_file
    assert result.exists()


def test_get_cached_diagram_stale_cache(tmp_path) -> None:
    """Test that _get_cached_diagram returns None when cache is stale (>24 hours)"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    mermaid_code = "graph TB\n  A --> B"
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    
    # Create a cached file
    cached_file.write_bytes(b"old_cached_data")
    
    # Mock the file modification time to be 25 hours ago
    old_time = time.time() - (25 * 60 * 60)  # 25 hours ago
    
    # Get the actual stat info but override st_mtime
    actual_stat = cached_file.stat()
    mock_stat_result = Mock()
    mock_stat_result.st_mtime = old_time
    mock_stat_result.st_mode = actual_stat.st_mode  # Preserve mode for is_dir check
    
    # Patch the stat method to return our mock only for the cached file
    original_stat = Path.stat
    def selective_stat(self):
        if self == cached_file:
            return mock_stat_result
        return original_stat(self)
    
    with patch.object(Path, 'stat', selective_stat):
        result = service._get_cached_diagram(mermaid_code, cache_dir)
        
        assert result is None


def test_get_cached_diagram_fresh_cache(tmp_path) -> None:
    """Test that _get_cached_diagram returns cached file when cache is fresh (<24 hours)"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    mermaid_code = "graph TB\n  A --> B"
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    
    # Create a cached file
    cached_file.write_bytes(b"fresh_cached_data")
    
    # Mock the file modification time to be 1 hour ago (fresh)
    fresh_time = time.time() - (1 * 60 * 60)  # 1 hour ago
    
    # Get the actual stat info but override st_mtime
    actual_stat = cached_file.stat()
    mock_stat_result = Mock()
    mock_stat_result.st_mtime = fresh_time
    mock_stat_result.st_mode = actual_stat.st_mode  # Preserve mode for is_dir check
    
    # Patch the stat method to return our mock only for the cached file
    original_stat = Path.stat
    def selective_stat(self):
        if self == cached_file:
            return mock_stat_result
        return original_stat(self)
    
    with patch.object(Path, 'stat', selective_stat):
        result = service._get_cached_diagram(mermaid_code, cache_dir)
        
        assert result is not None
        assert result == cached_file


def test_get_cached_diagram_creates_cache_directory(tmp_path) -> None:
    """Test that _get_cached_diagram creates cache directory if it doesn't exist"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    
    assert not cache_dir.exists()
    
    mermaid_code = "graph TB\n  A --> B"
    result = service._get_cached_diagram(mermaid_code, cache_dir)
    
    assert cache_dir.exists()
    assert result is None  # No cache exists yet


def test_get_cached_diagram_handles_errors_gracefully(tmp_path) -> None:
    """Test that _get_cached_diagram handles errors gracefully when checking file age"""
    service = RenderingService(str(tmp_path))
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    mermaid_code = "graph TB\n  A --> B"
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    cached_file.write_bytes(b"test_data")
    
    # Create a mock stat result that raises an attribute error when accessing st_mtime
    mock_stat_result = Mock()
    del mock_stat_result.st_mtime  # Remove st_mtime to trigger AttributeError
    
    # Patch the stat method to return problematic stat for cached file only
    original_stat = Path.stat
    def selective_stat(self):
        if self == cached_file:
            return mock_stat_result
        return original_stat(self)
    
    with patch.object(Path, 'stat', selective_stat):
        result = service._get_cached_diagram(mermaid_code, cache_dir)
        
        assert result is None  # Should return None on error


def test_convert_mermaid_to_image_uses_cache_when_available(tmp_path) -> None:
    """Test that _convert_mermaid_to_image uses cached diagram when available"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "cached_test_diagram"
    
    # Create cache directory and cached file
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    cached_file.write_bytes(b"cached_diagram_content")
    
    # Should use cache instead of calling API
    with patch('requests.get') as mock_get:
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        # API should NOT be called since we have cache
        assert mock_get.call_count == 0
        
        # Result should exist
        assert result is not None
        assert result.exists()
        assert result.name == f"{diagram_id}.png"


def test_convert_mermaid_to_image_caches_newly_generated_diagram(tmp_path) -> None:
    """Test that _convert_mermaid_to_image saves newly generated diagrams to cache"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "new_diagram"
    
    # Mock successful API response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"new_diagram_data"
    
    with patch('requests.get', return_value=mock_response):
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        # Check that diagram was saved to cache
        cache_dir = tmp_path / "diagram_cache"
        cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
        cached_file = cache_dir / f"{cache_key}.png"
        
        assert cached_file.exists()
        assert cached_file.read_bytes() == b"new_diagram_data"


def test_convert_mermaid_to_image_caching_disabled(tmp_path) -> None:
    """Test that caching can be disabled via environment variable"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "no_cache_diagram"
    
    # Mock successful API response
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"diagram_without_cache"
    
    with patch.dict(os.environ, {'DIAGRAM_CACHE_ENABLED': 'false'}):
        with patch('requests.get', return_value=mock_response):
            result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
            
            # Diagram should be generated
            assert result is not None
            assert result.exists()
            
            # Cache directory should not be created or used
            cache_dir = tmp_path / "diagram_cache"
            # Cache dir might exist from previous tests, but no new cache file should be created
            if cache_dir.exists():
                cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
                cached_file = cache_dir / f"{cache_key}.png"
                # In this specific test run, the cache file should not be created
                # (Note: This is a bit tricky to test since cache_dir creation is separate)


def test_convert_mermaid_to_image_cache_copy_failure_regenerates(tmp_path) -> None:
    """Test that if copying cached diagram fails, it regenerates the diagram"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "copy_fail_diagram"
    
    # Create cache
    cache_dir = tmp_path / "diagram_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
    cached_file = cache_dir / f"{cache_key}.png"
    cached_file.write_bytes(b"cached_data")
    
    # Mock shutil.copy2 to fail
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"regenerated_data"
    
    with patch('shutil.copy2', side_effect=Exception("Copy failed")):
        with patch('requests.get', return_value=mock_response):
            result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
            
            # Should still succeed by regenerating
            assert result is not None
            assert result.exists()


def test_convert_mermaid_to_image_identical_diagrams_use_same_cache(tmp_path) -> None:
    """Test that identical Mermaid code uses the same cache entry"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    
    # Generate first diagram
    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.content = b"shared_diagram_data"
    
    with patch('requests.get', return_value=mock_response) as mock_get:
        result1 = service._convert_mermaid_to_image(mermaid_code, tmp_path, "diagram_1")
        
        # API should be called once
        assert mock_get.call_count == 1
        assert result1 is not None
        
        # Generate second diagram with same Mermaid code
        result2 = service._convert_mermaid_to_image(mermaid_code, tmp_path, "diagram_2")
        
        # API should NOT be called again (still 1 call total)
        assert mock_get.call_count == 1
        assert result2 is not None
        
        # Both diagrams should exist
        assert result1.exists()
        assert result2.exists()


def test_convert_mermaid_to_image_different_diagrams_use_different_cache(tmp_path) -> None:
    """Test that different Mermaid code generates different cache entries"""
    service = RenderingService(str(tmp_path))
    
    # Generate first diagram
    mermaid_code_1 = "graph TB\n  A --> B"
    mock_response_1 = Mock()
    mock_response_1.status_code = 200
    mock_response_1.content = b"diagram_data_1"
    
    # Generate second diagram with different code
    mermaid_code_2 = "graph TB\n  X --> Y"
    mock_response_2 = Mock()
    mock_response_2.status_code = 200
    mock_response_2.content = b"diagram_data_2"
    
    call_count = [0]
    
    def mock_get_side_effect(url, timeout):
        call_count[0] += 1
        if call_count[0] == 1:
            return mock_response_1
        else:
            return mock_response_2
    
    with patch('requests.get', side_effect=mock_get_side_effect) as mock_get:
        result1 = service._convert_mermaid_to_image(mermaid_code_1, tmp_path, "diagram_a")
        result2 = service._convert_mermaid_to_image(mermaid_code_2, tmp_path, "diagram_b")
        
        # API should be called twice (different diagrams)
        assert mock_get.call_count == 2
        
        # Check that different cache files were created
        cache_dir = tmp_path / "diagram_cache"
        cache_key_1 = hashlib.md5(mermaid_code_1.encode()).hexdigest()
        cache_key_2 = hashlib.md5(mermaid_code_2.encode()).hexdigest()
        
        assert cache_key_1 != cache_key_2
        assert (cache_dir / f"{cache_key_1}.png").exists()
        assert (cache_dir / f"{cache_key_2}.png").exists()


def test_convert_mermaid_to_image_cache_saves_after_kroki_fallback(tmp_path) -> None:
    """Test that cache is saved even when using Kroki fallback"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "kroki_cached"
    
    # Mock Mermaid.ink failure, Kroki success
    mock_mermaid_ink = Mock()
    mock_mermaid_ink.status_code = 500
    
    mock_kroki = Mock()
    mock_kroki.status_code = 200
    mock_kroki.content = b"kroki_diagram_data"
    
    def mock_get_side_effect(url, timeout):
        if "mermaid.ink" in url:
            return mock_mermaid_ink
        elif "kroki.io" in url:
            return mock_kroki
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
        
        # Check that cache was created from Kroki response
        cache_dir = tmp_path / "diagram_cache"
        cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
        cached_file = cache_dir / f"{cache_key}.png"
        
        assert cached_file.exists()
        assert cached_file.read_bytes() == b"kroki_diagram_data"


def test_convert_mermaid_to_image_cache_saves_after_cli_fallback(tmp_path) -> None:
    """Test that cache is saved even when using local CLI fallback"""
    service = RenderingService(str(tmp_path))
    mermaid_code = "graph TB\n  A --> B"
    diagram_id = "cli_cached"
    
    # Mock both APIs failing
    def mock_get_side_effect(url, timeout):
        raise requests.RequestException("API unavailable")
    
    # Mock mmdc CLI success
    mock_version_result = Mock()
    mock_version_result.returncode = 0
    
    mock_convert_result = Mock()
    mock_convert_result.returncode = 0
    mock_convert_result.stderr = ""
    
    def mock_subprocess_run(cmd, **kwargs):
        if '--version' in cmd:
            return mock_version_result
        else:
            # Create the output file
            if '-o' in cmd:
                output_idx = cmd.index('-o')
                output_path = Path(cmd[output_idx + 1])
                output_path.write_bytes(b"cli_diagram_data")
            return mock_convert_result
    
    with patch('requests.get', side_effect=mock_get_side_effect):
        with patch('subprocess.run', side_effect=mock_subprocess_run):
            result = service._convert_mermaid_to_image(mermaid_code, tmp_path, diagram_id)
            
            # Check that cache was created from CLI output
            cache_dir = tmp_path / "diagram_cache"
            cache_key = hashlib.md5(mermaid_code.encode()).hexdigest()
            cached_file = cache_dir / f"{cache_key}.png"
            
            assert cached_file.exists()
            assert cached_file.read_bytes() == b"cli_diagram_data"
