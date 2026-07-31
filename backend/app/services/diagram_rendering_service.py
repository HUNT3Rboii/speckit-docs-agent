"""
DiagramRenderingService for rendering Mermaid diagrams to PNG.

Implements:
- Primary: mmdc CLI for local rendering (1200x800px, transparent background)
- Fallback: Kroki API with one-time privacy warning
- Caching: Rendered diagrams cached by content hash
"""

import base64
import hashlib
import logging
import os
import subprocess
import shutil
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests


@dataclass
class RenderResult:
    """Result of diagram rendering operation."""
    success: bool
    image_path: Optional[str] = None
    error_message: Optional[str] = None
    rendering_method: str = ""  # "mmdc", "kroki", or "failed"
    cache_hit: bool = False


class DiagramRenderingService:
    """
    Service for rendering Mermaid diagrams to PNG images.
    
    - Primary rendering method: mmdc CLI (local, no external calls)
    - Fallback rendering method: Kroki API (external service)
    - Caching: Renders keyed by content hash to avoid duplicates
    - Privacy: One-time warning when falling back to Kroki
    """
    
    # Class-level flag to track if Kroki warning has been shown
    _kroki_warning_shown = False
    
    def __init__(self, cache_dir: str = "./diagram_cache"):
        """
        Initialize DiagramRenderingService.
        
        Args:
            cache_dir: Directory for caching rendered diagrams
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.logger = logging.getLogger(__name__)
    
    def render_diagram(self, mermaid_code: str, diagram_id: str) -> RenderResult:
        """
        Render a Mermaid diagram using primary/fallback methods.
        
        Attempts rendering with mmdc first, falls back to Kroki if mmdc unavailable,
        returns cached result if diagram already rendered.
        
        Args:
            mermaid_code: Mermaid diagram syntax
            diagram_id: Unique diagram identifier
        
        Returns:
            RenderResult with success status, image path, and rendering method
        """
        if not mermaid_code or not mermaid_code.strip():
            return RenderResult(
                success=False,
                error_message="Empty mermaid_code",
                rendering_method="failed"
            )
        
        # Check cache first
        cached_path = self._check_cache(mermaid_code)
        if cached_path:
            self.logger.info(f"Cache hit for diagram {diagram_id}")
            return RenderResult(
                success=True,
                image_path=str(cached_path),
                rendering_method="cache",
                cache_hit=True
            )
        
        # Try primary method: mmdc
        output_path = self.cache_dir / f"{diagram_id}.png"
        result = self.render_with_mmdc(mermaid_code, str(output_path))
        
        if result.success:
            # Cache the result
            self._cache_diagram(mermaid_code, output_path)
            return result
        
        # Fall back to Kroki
        self.logger.warning(f"mmdc rendering failed for {diagram_id}, falling back to Kroki")
        self._show_kroki_warning()
        result = self.render_with_kroki(mermaid_code, str(output_path))
        
        if result.success:
            # Cache the result
            self._cache_diagram(mermaid_code, output_path)
            return result
        
        # Both methods failed
        self.logger.error(f"Failed to render diagram {diagram_id}: {result.error_message}")
        return RenderResult(
            success=False,
            error_message=f"mmdc failed, Kroki failed: {result.error_message}",
            rendering_method="failed"
        )
    
    def render_with_mmdc(self, mermaid_code: str, output_path: str) -> RenderResult:
        """
        Render diagram using local mmdc CLI.
        
        Sets PNG output to 1200x800px with transparent background.
        
        Args:
            mermaid_code: Mermaid diagram syntax
            output_path: Path where PNG will be saved
        
        Returns:
            RenderResult with success status and image path or error message
        """
        try:
            # Resolve the actual executable path rather than passing the bare
            # name "mmdc" to subprocess.run(). On Windows, npm installs CLI
            # tools as .CMD/.PS1 shims rather than a directly-executable
            # binary; Windows' CreateProcess (which subprocess.run uses
            # without shell=True) cannot launch those by bare name and raises
            # FileNotFoundError even though the shim is on PATH and a shell
            # like Git Bash can find and run it fine. shutil.which() respects
            # PATHEXT and resolves to e.g. "mmdc.CMD" on Windows, or the plain
            # executable on Linux/Mac, so this works cross-platform.
            mmdc_path = shutil.which("mmdc")
            if not mmdc_path:
                return RenderResult(
                    success=False,
                    error_message="mmdc not found on PATH",
                    rendering_method="mmdc"
                )

            version_result = subprocess.run(
                [mmdc_path, "--version"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if version_result.returncode != 0:
                return RenderResult(
                    success=False,
                    error_message="mmdc not available",
                    rendering_method="mmdc"
                )

            # Create temporary input file
            temp_input = Path(output_path).parent / f"temp_{hashlib.md5(mermaid_code.encode()).hexdigest()}.mmd"
            try:
                with open(temp_input, "w", encoding="utf-8") as f:
                    f.write(mermaid_code)

                # Run mmdc with 1200x800 dimensions and transparent background
                mmdc_args = [
                    mmdc_path,
                    "-i", str(temp_input),
                    "-o", output_path,
                    "-w", "1200",
                    "-H", "800",
                    "--backgroundColor", "transparent"
                ]

                # Inside containers, Puppeteer's bundled Chromium usually can't
                # use its default sandbox (requires privileges the container
                # doesn't grant); MMDC_PUPPETEER_CONFIG points at a config file
                # enabling --no-sandbox for that environment. Not needed (and
                # left unset) for normal local/dev use.
                puppeteer_config = os.getenv("MMDC_PUPPETEER_CONFIG")
                if puppeteer_config:
                    mmdc_args.extend(["--puppeteerConfigFile", puppeteer_config])

                result = subprocess.run(
                    mmdc_args,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0 and Path(output_path).exists():
                    self.logger.info(f"Successfully rendered diagram to {output_path} using mmdc")
                    return RenderResult(
                        success=True,
                        image_path=output_path,
                        rendering_method="mmdc"
                    )
                else:
                    error_msg = result.stderr or result.stdout or "Unknown error"
                    self.logger.warning(f"mmdc rendering failed: {error_msg}")
                    return RenderResult(
                        success=False,
                        error_message=error_msg,
                        rendering_method="mmdc"
                    )
            
            finally:
                # Clean up temporary file
                if temp_input.exists():
                    try:
                        temp_input.unlink()
                    except Exception as e:
                        self.logger.warning(f"Failed to delete temp file {temp_input}: {e}")
        
        except FileNotFoundError:
            return RenderResult(
                success=False,
                error_message="mmdc not found in PATH",
                rendering_method="mmdc"
            )
        except subprocess.TimeoutExpired:
            return RenderResult(
                success=False,
                error_message="mmdc rendering timed out",
                rendering_method="mmdc"
            )
        except Exception as e:
            return RenderResult(
                success=False,
                error_message=f"mmdc error: {str(e)}",
                rendering_method="mmdc"
            )
    
    def render_with_kroki(self, mermaid_code: str, output_path: str) -> RenderResult:
        """
        Render diagram using Kroki API as fallback.
        
        Sends diagram to external Kroki service. User should be warned about
        privacy implications as content is sent to third party.
        
        Args:
            mermaid_code: Mermaid diagram syntax
            output_path: Path where PNG will be saved
        
        Returns:
            RenderResult with success status and image path or error message
        """
        try:
            # Kroki's GET API requires the diagram source to be zlib-deflated
            # *before* base64url-encoding (see https://docs.kroki.io/kroki/setup/encode-diagram/).
            # Encoding the raw UTF-8 bytes directly (without the deflate step)
            # produces a payload Kroki cannot decode, and it responds with
            # "400: Unable to decode the source." for every request.
            mermaid_bytes = mermaid_code.encode("utf-8")
            compressed = zlib.compress(mermaid_bytes, 9)
            base64_encoded = base64.urlsafe_b64encode(compressed).decode("utf-8")

            # Kroki API endpoint
            kroki_url = f"https://kroki.io/mermaid/png/{base64_encoded}"
            
            # Make request to Kroki with timeout
            response = requests.get(kroki_url, timeout=10)
            
            if response.status_code == 200 and response.content:
                # Save PNG to output path
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(response.content)
                
                self.logger.info(f"Successfully rendered diagram to {output_path} using Kroki")
                return RenderResult(
                    success=True,
                    image_path=output_path,
                    rendering_method="kroki"
                )
            else:
                error_msg = f"Kroki returned status {response.status_code}"
                self.logger.warning(error_msg)
                return RenderResult(
                    success=False,
                    error_message=error_msg,
                    rendering_method="kroki"
                )
        
        except requests.Timeout:
            error_msg = "Kroki request timed out"
            self.logger.warning(error_msg)
            return RenderResult(
                success=False,
                error_message=error_msg,
                rendering_method="kroki"
            )
        except Exception as e:
            error_msg = f"Kroki error: {str(e)}"
            self.logger.warning(error_msg)
            return RenderResult(
                success=False,
                error_message=error_msg,
                rendering_method="kroki"
            )
    
    def _check_cache(self, mermaid_code: str) -> Optional[Path]:
        """
        Check if diagram has been rendered and cached.
        
        Args:
            mermaid_code: Mermaid diagram syntax
        
        Returns:
            Path to cached PNG if exists, None otherwise
        """
        cache_key = hashlib.sha256(mermaid_code.encode()).hexdigest()
        cache_path = self.cache_dir / f"{cache_key}.png"
        
        if cache_path.exists():
            return cache_path
        
        return None
    
    def _cache_diagram(self, mermaid_code: str, image_path: Path) -> bool:
        """
        Cache a rendered diagram by content hash.
        
        Args:
            mermaid_code: Original Mermaid diagram syntax
            image_path: Path to rendered PNG
        
        Returns:
            True if cached successfully, False otherwise
        """
        try:
            cache_key = hashlib.sha256(mermaid_code.encode()).hexdigest()
            cache_path = self.cache_dir / f"{cache_key}.png"
            
            if image_path.exists():
                shutil.copy2(image_path, cache_path)
                self.logger.debug(f"Cached diagram with key {cache_key}")
                return True
            else:
                self.logger.warning(f"Image path {image_path} does not exist, not caching")
                return False
        
        except Exception as e:
            self.logger.warning(f"Failed to cache diagram: {e}")
            return False
    
    def _show_kroki_warning(self) -> None:
        """
        Show one-time warning about Kroki privacy implications.
        
        Only shows once per service instance.
        """
        if DiagramRenderingService._kroki_warning_shown:
            return
        
        DiagramRenderingService._kroki_warning_shown = True
        
        warning_msg = (
            "WARNING: mmdc is unavailable, falling back to Kroki for diagram rendering. "
            "This means diagram content will be sent to the external Kroki service "
            "(https://kroki.io). If your diagrams contain sensitive information, "
            "please install mermaid-cli locally: npm install -g @mermaid-js/mermaid-cli"
        )
        
        self.logger.warning(warning_msg)
        # Best-effort console echo only - never let this crash the request.
        # The emoji previously here raised UnicodeEncodeError on Windows
        # consoles using a non-UTF-8 codepage (cp1252 by default), which
        # propagated out of render_diagram() uncaught and would fail the
        # entire /api/process request the first time Kroki fallback ever
        # triggered on a given process.
        try:
            print(f"\n{warning_msg}\n")
        except Exception:
            pass
