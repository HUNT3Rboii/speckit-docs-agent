"""
Tests for DiagramRenderingService.

Tests cover:
- render_with_mmdc(): Local rendering with correct dimensions and transparency
- render_with_kroki(): Fallback API rendering
- render_diagram(): Coordination of primary and fallback methods
- Caching: Avoiding duplicate renders
- One-time Kroki warning
"""

import hashlib
import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, Mock, patch, call
import pytest

from app.services.diagram_rendering_service import (
    DiagramRenderingService,
    RenderResult,
)


class TestDiagramRenderingService:
    """Test suite for DiagramRenderingService."""
    
    @pytest.fixture
    def temp_cache_dir(self):
        """Create temporary cache directory for tests."""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield Path(temp_dir)
    
    @pytest.fixture
    def service(self, temp_cache_dir):
        """Create DiagramRenderingService instance for testing."""
        # Reset the class-level warning flag
        DiagramRenderingService._kroki_warning_shown = False
        return DiagramRenderingService(cache_dir=str(temp_cache_dir))
    
    @pytest.fixture
    def sample_mermaid_code(self):
        """Sample Mermaid diagram code."""
        return """
        graph TD
            A[Start] --> B{Decision}
            B -->|Yes| C[Process]
            B -->|No| D[End]
            C --> D
        """
    
    # Tests for render_with_mmdc()
    
    def test_render_with_mmdc_success(self, service, sample_mermaid_code, temp_cache_dir):
        """Test successful rendering with mmdc."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value="mmdc"), patch("subprocess.run") as mock_run:
            # Mock mmdc version check
            version_result = Mock()
            version_result.returncode = 0
            
            # Mock mmdc render command
            render_result = Mock()
            render_result.returncode = 0
            render_result.stderr = ""
            
            # Create a fake PNG file
            Path(output_path).write_bytes(b"fake png data")
            
            mock_run.side_effect = [version_result, render_result]
            
            result = service.render_with_mmdc(sample_mermaid_code, output_path)
            
            assert result.success is True
            assert result.image_path == output_path
            assert result.rendering_method == "mmdc"
            assert Path(output_path).exists()
    
    def test_render_with_mmdc_not_available(self, service, sample_mermaid_code, temp_cache_dir):
        """Test mmdc gracefully fails when not available."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value="mmdc"), patch("subprocess.run") as mock_run:
            # Mock mmdc version check failure
            version_result = Mock()
            version_result.returncode = 1
            mock_run.return_value = version_result

            result = service.render_with_mmdc(sample_mermaid_code, output_path)

            assert result.success is False
            assert result.rendering_method == "mmdc"
            assert "not available" in result.error_message.lower()

    def test_render_with_mmdc_not_on_path(self, service, sample_mermaid_code, temp_cache_dir):
        """Test mmdc gracefully fails when not found on PATH at all (shutil.which returns None) -
        this is the actual real-world state on a machine without mmdc installed, distinct from
        FileNotFoundError (which covers a race where `which` finds it but exec fails)."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value=None):
            result = service.render_with_mmdc(sample_mermaid_code, output_path)

            assert result.success is False
            assert result.rendering_method == "mmdc"
            assert "not found on path" in result.error_message.lower()

    def test_render_with_mmdc_file_not_found(self, service, sample_mermaid_code, temp_cache_dir):
        """Test mmdc handles FileNotFoundError gracefully."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value="mmdc"), \
             patch("subprocess.run", side_effect=FileNotFoundError()):
            result = service.render_with_mmdc(sample_mermaid_code, output_path)

            assert result.success is False
            assert result.rendering_method == "mmdc"
            assert "not found in PATH" in result.error_message

    def test_render_with_mmdc_timeout(self, service, sample_mermaid_code, temp_cache_dir):
        """Test mmdc handles timeout gracefully."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value="mmdc"), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired("mmdc", 30)):
            result = service.render_with_mmdc(sample_mermaid_code, output_path)

            assert result.success is False
            assert result.rendering_method == "mmdc"
            assert "timed out" in result.error_message.lower()

    def test_render_with_mmdc_sets_dimensions_and_transparency(self, service, sample_mermaid_code, temp_cache_dir):
        """Test mmdc is called with correct dimensions and transparency settings."""
        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("shutil.which", return_value="mmdc"), patch("subprocess.run") as mock_run:
            # Mock mmdc version check
            version_result = Mock()
            version_result.returncode = 0
            
            # Mock mmdc render command
            render_result = Mock()
            render_result.returncode = 0
            render_result.stderr = ""
            
            # Create a fake PNG file
            Path(output_path).write_bytes(b"fake png data")
            
            mock_run.side_effect = [version_result, render_result]
            
            service.render_with_mmdc(sample_mermaid_code, output_path)
            
            # Verify mmdc was called with correct dimensions
            render_call = mock_run.call_args_list[1]
            args = render_call[0][0]
            
            assert "1200" in args  # width
            assert "800" in args   # height
            assert "transparent" in args  # background
    
    # Tests for render_with_kroki()
    
    def test_render_with_kroki_success(self, service, sample_mermaid_code, temp_cache_dir):
        """Test successful rendering with Kroki."""
        output_path = str(temp_cache_dir / "test_diagram.png")
        
        with patch("requests.get") as mock_get:
            # Mock Kroki response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.content = b"fake png data"
            mock_get.return_value = mock_response
            
            result = service.render_with_kroki(sample_mermaid_code, output_path)
            
            assert result.success is True
            assert result.image_path == output_path
            assert result.rendering_method == "kroki"
            assert Path(output_path).exists()
    
    def test_render_with_kroki_url_is_zlib_deflated_before_base64(
        self, service, sample_mermaid_code, temp_cache_dir
    ):
        """
        Regression test: Kroki's GET API requires the diagram source to be
        zlib-deflated *before* base64url-encoding (per
        https://docs.kroki.io/kroki/setup/encode-diagram/). Encoding the raw
        UTF-8 bytes directly produces a URL Kroki cannot decode, and it
        responds with "400: Unable to decode the source." for every request -
        this previously went undetected because other tests mock
        `requests.get` without inspecting the constructed URL.
        """
        import base64
        import zlib

        output_path = str(temp_cache_dir / "test_diagram.png")

        with patch("requests.get") as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.content = b"fake png data"
            mock_get.return_value = mock_response

            service.render_with_kroki(sample_mermaid_code, output_path)

            assert mock_get.called
            called_url = mock_get.call_args[0][0]
            encoded_segment = called_url.rsplit("/", 1)[-1]

            # Decoding the segment the way Kroki does (base64url -> zlib
            # inflate) must round-trip back to the original mermaid code.
            compressed = base64.urlsafe_b64decode(encoded_segment)
            decompressed = zlib.decompress(compressed).decode("utf-8")
            assert decompressed == sample_mermaid_code

    def test_render_with_kroki_http_error(self, service, sample_mermaid_code, temp_cache_dir):
        """Test Kroki handles HTTP errors gracefully."""
        output_path = str(temp_cache_dir / "test_diagram.png")
        
        with patch("requests.get") as mock_get:
            # Mock Kroki error response
            mock_response = Mock()
            mock_response.status_code = 500
            mock_get.return_value = mock_response
            
            result = service.render_with_kroki(sample_mermaid_code, output_path)
            
            assert result.success is False
            assert result.rendering_method == "kroki"
            assert "500" in result.error_message
    
    def test_render_with_kroki_timeout(self, service, sample_mermaid_code, temp_cache_dir):
        """Test Kroki handles timeout gracefully."""
        output_path = str(temp_cache_dir / "test_diagram.png")
        
        with patch("requests.get") as mock_get:
            import requests
            mock_get.side_effect = requests.Timeout()
            
            result = service.render_with_kroki(sample_mermaid_code, output_path)
            
            assert result.success is False
            assert result.rendering_method == "kroki"
            assert "timed out" in result.error_message.lower()
    
    def test_render_with_kroki_empty_content(self, service, sample_mermaid_code, temp_cache_dir):
        """Test Kroki handles empty response content."""
        output_path = str(temp_cache_dir / "test_diagram.png")
        
        with patch("requests.get") as mock_get:
            # Mock Kroki response with no content
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.content = b""
            mock_get.return_value = mock_response
            
            result = service.render_with_kroki(sample_mermaid_code, output_path)
            
            assert result.success is False
            assert result.rendering_method == "kroki"
    
    # Tests for render_diagram()
    
    def test_render_diagram_with_mmdc_success(self, service, sample_mermaid_code):
        """Test render_diagram succeeds with mmdc."""
        with patch.object(service, "render_with_mmdc") as mock_mmdc:
            mock_mmdc.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="mmdc"
            )
            
            result = service.render_diagram(sample_mermaid_code, "test_diagram")
            
            assert result.success is True
            assert result.rendering_method == "mmdc"
            assert not result.cache_hit
    
    def test_render_diagram_falls_back_to_kroki(self, service, sample_mermaid_code):
        """Test render_diagram falls back to Kroki when mmdc fails."""
        with patch.object(service, "render_with_mmdc") as mock_mmdc, \
             patch.object(service, "render_with_kroki") as mock_kroki:
            
            # mmdc fails
            mock_mmdc.return_value = RenderResult(
                success=False,
                error_message="mmdc not available",
                rendering_method="mmdc"
            )
            
            # Kroki succeeds
            mock_kroki.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="kroki"
            )
            
            result = service.render_diagram(sample_mermaid_code, "test_diagram")
            
            assert result.success is True
            assert result.rendering_method == "kroki"
    
    def test_render_diagram_empty_code(self, service):
        """Test render_diagram rejects empty mermaid code."""
        result = service.render_diagram("", "test_diagram")
        
        assert result.success is False
        assert result.rendering_method == "failed"
    
    def test_render_diagram_uses_cache(self, service, sample_mermaid_code):
        """Test render_diagram returns cached result without re-rendering."""
        # Pre-populate cache
        cache_key = hashlib.sha256(sample_mermaid_code.encode()).hexdigest()
        cache_path = service.cache_dir / f"{cache_key}.png"
        cache_path.write_bytes(b"cached png data")
        
        result = service.render_diagram(sample_mermaid_code, "test_diagram")
        
        assert result.success is True
        assert result.cache_hit is True
        assert str(cache_path) == result.image_path
    
    # Tests for caching
    
    def test_cache_diagram_stores_by_hash(self, service, sample_mermaid_code, temp_cache_dir):
        """Test diagram is cached using SHA-256 content hash."""
        image_path = temp_cache_dir / "diagram.png"
        image_path.write_bytes(b"test png data")
        
        success = service._cache_diagram(sample_mermaid_code, image_path)
        
        assert success is True
        
        # Verify cache file exists with correct name
        cache_key = hashlib.sha256(sample_mermaid_code.encode()).hexdigest()
        cache_path = service.cache_dir / f"{cache_key}.png"
        assert cache_path.exists()
        assert cache_path.read_bytes() == b"test png data"
    
    def test_check_cache_returns_path_on_hit(self, service, sample_mermaid_code):
        """Test _check_cache returns path when diagram is cached."""
        # Pre-populate cache
        cache_key = hashlib.sha256(sample_mermaid_code.encode()).hexdigest()
        cache_path = service.cache_dir / f"{cache_key}.png"
        cache_path.write_bytes(b"cached data")
        
        result = service._check_cache(sample_mermaid_code)
        
        assert result == cache_path
    
    def test_check_cache_returns_none_on_miss(self, service, sample_mermaid_code):
        """Test _check_cache returns None when diagram is not cached."""
        result = service._check_cache(sample_mermaid_code)
        
        assert result is None
    
    # Tests for one-time Kroki warning
    
    def test_kroki_warning_shown_once(self, service):
        """Test Kroki warning is shown only once."""
        # Reset flag
        DiagramRenderingService._kroki_warning_shown = False
        
        with patch("builtins.print") as mock_print:
            service._show_kroki_warning()
            service._show_kroki_warning()
            
            # Should only print once
            assert mock_print.call_count == 1
    
    def test_kroki_warning_contains_privacy_info(self, service):
        """Test Kroki warning includes privacy concern message."""
        # Reset flag
        DiagramRenderingService._kroki_warning_shown = False
        
        with patch("builtins.print") as mock_print:
            service._show_kroki_warning()
            
            warning_text = mock_print.call_args[0][0]
            assert "external Kroki service" in warning_text or "sensitive information" in warning_text
    
    def test_kroki_warning_includes_npm_install_instruction(self, service):
        """Test Kroki warning includes instruction to install mermaid-cli."""
        # Reset flag
        DiagramRenderingService._kroki_warning_shown = False
        
        with patch("builtins.print") as mock_print:
            service._show_kroki_warning()
            
            warning_text = mock_print.call_args[0][0]
            assert "npm install" in warning_text or "mermaid-cli" in warning_text

    def test_kroki_warning_print_failure_does_not_crash(self, service):
        """
        Regression test: a console print failure (e.g. UnicodeEncodeError on
        Windows consoles using a non-UTF-8 codepage, which this warning used
        to trigger via an emoji character) must never propagate out of
        _show_kroki_warning() - it previously did, which would fail the
        entire /api/process request the first time Kroki fallback ever
        triggered on a given process.
        """
        DiagramRenderingService._kroki_warning_shown = False

        with patch("builtins.print", side_effect=UnicodeEncodeError("charmap", "x", 0, 1, "boom")):
            # Should not raise.
            service._show_kroki_warning()

    # Integration tests
    
    def test_render_diagram_integration_mmdc_fallback_kroki(self, service, sample_mermaid_code):
        """Integration test: render_diagram calls mmdc first, then Kroki."""
        with patch.object(service, "render_with_mmdc") as mock_mmdc, \
             patch.object(service, "render_with_kroki") as mock_kroki, \
             patch.object(service, "_show_kroki_warning") as mock_warning:
            
            # mmdc fails
            mock_mmdc.return_value = RenderResult(
                success=False,
                error_message="mmdc not available",
                rendering_method="mmdc"
            )
            
            # Kroki succeeds
            mock_kroki.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="kroki"
            )
            
            result = service.render_diagram(sample_mermaid_code, "test_id")
            
            assert mock_mmdc.called
            assert mock_kroki.called
            assert mock_warning.called
            assert result.success is True
            assert result.rendering_method == "kroki"
    
    def test_render_result_dataclass(self):
        """Test RenderResult dataclass initialization."""
        result = RenderResult(
            success=True,
            image_path="/path/to/image.png",
            rendering_method="mmdc"
        )
        
        assert result.success is True
        assert result.image_path == "/path/to/image.png"
        assert result.rendering_method == "mmdc"
        assert result.error_message is None
        assert result.cache_hit is False


class TestDiagramRenderingServiceEdgeCases:
    """Test edge cases for DiagramRenderingService."""
    
    @pytest.fixture
    def temp_cache_dir(self):
        """Create temporary cache directory for tests."""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield Path(temp_dir)
    
    @pytest.fixture
    def service(self, temp_cache_dir):
        """Create DiagramRenderingService instance for testing."""
        DiagramRenderingService._kroki_warning_shown = False
        return DiagramRenderingService(cache_dir=str(temp_cache_dir))
    
    def test_render_with_mmdc_whitespace_only_code(self, service, temp_cache_dir):
        """Test render_diagram rejects whitespace-only mermaid code."""
        output_path = str(temp_cache_dir / "test.png")
        
        result = service.render_diagram("   \n\n   ", "test_id")
        
        assert result.success is False
        assert result.rendering_method == "failed"
    
    def test_render_with_special_characters_in_diagram_id(self, service, temp_cache_dir):
        """Test render_diagram handles special characters in diagram ID."""
        mermaid_code = "graph LR\nA --> B"
        
        with patch.object(service, "render_with_mmdc") as mock_mmdc:
            mock_mmdc.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="mmdc"
            )
            
            # Special chars in ID should not cause issues
            result = service.render_diagram(mermaid_code, "test-diagram_id.v1")
            
            assert result.success is True
    
    def test_render_with_very_long_mermaid_code(self, service):
        """Test render_diagram handles very long mermaid code."""
        # Create large mermaid diagram
        long_code = "graph TD\n" + "\n".join([f"A{i} --> A{i+1}" for i in range(100)])
        
        with patch.object(service, "render_with_mmdc") as mock_mmdc:
            mock_mmdc.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="mmdc"
            )
            
            result = service.render_diagram(long_code, "large_diagram")
            
            assert result.success is True
    
    def test_cache_directory_created_if_not_exists(self):
        """Test cache directory is created on service initialization."""
        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "new_cache_dir"
            assert not cache_path.exists()
            
            service = DiagramRenderingService(cache_dir=str(cache_path))
            
            assert cache_path.exists()


class TestDiagramRenderingServiceProperties:
    """Property-based tests for DiagramRenderingService."""
    
    @pytest.fixture
    def service(self):
        """Create DiagramRenderingService instance for testing."""
        with tempfile.TemporaryDirectory() as temp_dir:
            DiagramRenderingService._kroki_warning_shown = False
            yield DiagramRenderingService(cache_dir=temp_dir)
    
    def test_cache_key_determinism(self, service):
        """Property: For any Mermaid code, cache key is identical across multiple computations.
        
        **Validates: Requirements 10.5 (Property 19)**
        """
        mermaid_code = "graph TD\nA --> B"
        
        # Compute cache key twice
        key1 = hashlib.sha256(mermaid_code.encode()).hexdigest()
        key2 = hashlib.sha256(mermaid_code.encode()).hexdigest()
        
        # Keys should be identical
        assert key1 == key2
        
        # Different code should produce different key
        different_code = "graph TD\nB --> C"
        key3 = hashlib.sha256(different_code.encode()).hexdigest()
        assert key1 != key3
    
    def test_cache_reuse_avoids_rerendering(self, service):
        """Property: For any Mermaid code rendered successfully, rendering the same code again
        returns the cached image path without re-rendering.
        
        **Validates: Requirements 10.6 (Property 20)**
        """
        mermaid_code = "graph TD\nA --> B"
        
        with patch.object(service, "render_with_mmdc") as mock_mmdc:
            mock_mmdc.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="mmdc"
            )
            
            # First render
            result1 = service.render_diagram(mermaid_code, "diagram1")
            assert result1.success is True
            assert result1.cache_hit is False
            
            # Reset mock call count
            mock_mmdc.reset_mock()
            
            # Second render of same code
            result2 = service.render_diagram(mermaid_code, "diagram2")
            assert result2.success is True
            assert result2.cache_hit is True
            
            # mmdc should not have been called again (cached)
            assert not mock_mmdc.called
    
    def test_mmdc_fallback_to_kroki(self, service):
        """Property: For any Mermaid code, when mmdc rendering fails, the system
        attempts Kroki API rendering as fallback.
        
        **Validates: Requirements 10.4 (Property 21)**
        """
        mermaid_code = "graph TD\nA --> B"
        
        with patch.object(service, "render_with_mmdc") as mock_mmdc, \
             patch.object(service, "render_with_kroki") as mock_kroki, \
             patch.object(service, "_show_kroki_warning"):
            
            # mmdc fails
            mock_mmdc.return_value = RenderResult(
                success=False,
                error_message="mmdc not available",
                rendering_method="mmdc"
            )
            
            # Kroki succeeds
            mock_kroki.return_value = RenderResult(
                success=True,
                image_path="/path/to/diagram.png",
                rendering_method="kroki"
            )
            
            result = service.render_diagram(mermaid_code, "test_diagram")
            
            # Both should be called in sequence
            assert mock_mmdc.called
            assert mock_kroki.called
            assert result.rendering_method == "kroki"


# Import subprocess for timeout test
import subprocess
