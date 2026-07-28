"""
Bug Condition Exploration Test for Diagram Rendering

**CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists.
**DO NOT attempt to fix the test or code when it fails.**
**NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

This test surfaces counterexamples that demonstrate the bug: diagrams are missing from PDFs
even though the enhanced document contains valid diagram specifications with Mermaid code.

Bug Condition: isBugCondition(doc) = doc has non-empty diagrams array AND PDF lacks diagram images
Expected Behavior: Diagrams should be converted to images and embedded in the PDF
"""

import pytest
from pathlib import Path
from app.services.rendering import RenderingService
from app.services.diagram_generation import DiagramGenerationService
from app.services.document_enhancement import DocumentEnhancementService
import PyPDF2
import re


def count_images_in_pdf(pdf_path: Path) -> int:
    """
    Count the number of embedded images in a PDF file.
    Returns 0 if no images found (bug condition).
    """
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            image_count = 0
            
            for page in pdf_reader.pages:
                # Check for XObject resources (images are stored as XObjects)
                if '/Resources' in page:
                    resources = page['/Resources']
                    if resources and '/XObject' in resources:
                        xobjects = resources['/XObject']
                        if xobjects:
                            for obj_name in xobjects:
                                obj = xobjects[obj_name]
                                if obj and '/Subtype' in obj and obj['/Subtype'] == '/Image':
                                    image_count += 1
            
            return image_count
    except Exception as e:
        print(f"Error counting images: {e}")
        return 0


def test_bug_condition_single_architecture_diagram(tmp_path) -> None:
    """
    **Property 1: Bug Condition** - Diagrams Missing from PDFs
    
    Test Case: Enhanced document with single architecture diagram
    
    **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS (PDF has 0 images - bug exists)
    **EXPECTED OUTCOME ON FIXED CODE**: Test PASSES (PDF has >= 1 images - bug fixed)
    
    Counterexample: Enhanced document with architecture diagram generates PDF with zero images embedded.
    """
    # Arrange: Create enhanced document with architecture diagram including Mermaid code
    enhanced_doc = {
        "title": "System Architecture Documentation",
        "abstract": "Architecture overview with diagrams",
        "artifact_type": "spec",
        "source_path": "test/architecture.md",
        "enhanced": True,
        "sections": [
            {
                "heading": "System Architecture",
                "content": "Our system consists of Frontend, Backend, and Database components.",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "type": "architecture",
                "title": "System Architecture",
                "section_ref": "System Architecture",
                "mermaid_code": "graph TB\n  A[Frontend] --> B[Backend]\n  B --> C[Database]",
                "components": ["Frontend", "Backend", "Database"],
                "id": "arch-001"
            }
        ]
    }
    
    # Act: Render PDF using UNFIXED RenderingService
    service = RenderingService(str(tmp_path))
    result = service.render(
        artifact_id="test-arch",
        structured_json=enhanced_doc,
        artifact_type="spec",
        source_path="test/architecture.md"
    )
    
    pdf_path = Path(result["pdf_path"])
    
    # Assert: PDF should exist
    assert pdf_path.exists(), "PDF should be generated"
    
    # Assert: Check bug condition - PDF should contain embedded diagram images
    # On UNFIXED code: This will FAIL (image_count = 0), proving the bug exists
    # On FIXED code: This will PASS (image_count >= 1), proving the bug is fixed
    image_count = count_images_in_pdf(pdf_path)
    
    assert image_count >= 1, (
        f"Bug condition detected: Enhanced document has {len(enhanced_doc['diagrams'])} diagram(s) "
        f"but PDF contains {image_count} embedded images. "
        f"Expected at least 1 image. This confirms the bug exists - diagrams are missing from PDFs."
    )


def test_bug_condition_multiple_diagram_types(tmp_path) -> None:
    """
    **Property 1: Bug Condition** - Multiple Diagram Types Missing from PDFs
    
    Test Case: Enhanced document with architecture, API, and data model diagrams
    
    **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS (PDF has 0 images - bug exists)
    **EXPECTED OUTCOME ON FIXED CODE**: Test PASSES (PDF has >= 3 images - bug fixed)
    
    Counterexample: Enhanced document with 3 different diagram types generates PDF with zero images.
    """
    # Arrange: Create enhanced document with multiple diagram types
    enhanced_doc = {
        "title": "Complete System Documentation",
        "abstract": "Comprehensive documentation with multiple diagram types",
        "artifact_type": "spec",
        "source_path": "test/complete.md",
        "enhanced": True,
        "sections": [
            {
                "heading": "System Architecture",
                "content": "Architecture overview",
                "type": "normal"
            },
            {
                "heading": "API Endpoints",
                "content": "API documentation",
                "type": "normal"
            },
            {
                "heading": "Data Model",
                "content": "Database schema",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "type": "architecture",
                "title": "System Architecture",
                "section_ref": "System Architecture",
                "mermaid_code": "graph TB\n  A[Frontend] --> B[Backend]\n  B --> C[Database]",
                "components": ["Frontend", "Backend", "Database"],
                "id": "arch-001"
            },
            {
                "type": "api_endpoint",
                "title": "API Endpoints",
                "section_ref": "API Endpoints",
                "mermaid_code": "graph LR\n  Client[Client]\n  EP0[\"GET /users\"]\n  EP1[\"POST /users\"]\n  Client --> EP0\n  Client --> EP1",
                "endpoints": [
                    {"method": "GET", "path": "/users"},
                    {"method": "POST", "path": "/users"}
                ],
                "id": "api-001"
            },
            {
                "type": "data_model",
                "title": "Data Model",
                "section_ref": "Data Model",
                "mermaid_code": "erDiagram\n  User {\n    string id\n    string name\n  }\n  Post {\n    string id\n    string user_id\n  }\n  User ||--o{ Post : writes",
                "entities": ["User", "Post"],
                "id": "data-001"
            }
        ]
    }
    
    # Act: Render PDF using UNFIXED RenderingService
    service = RenderingService(str(tmp_path))
    result = service.render(
        artifact_id="test-complete",
        structured_json=enhanced_doc,
        artifact_type="spec",
        source_path="test/complete.md"
    )
    
    pdf_path = Path(result["pdf_path"])
    
    # Assert: PDF should exist
    assert pdf_path.exists(), "PDF should be generated"
    
    # Assert: Check bug condition - PDF should contain all 3 diagram images
    # On UNFIXED code: This will FAIL (image_count = 0), proving the bug exists
    # On FIXED code: This will PASS (image_count >= 3), proving the bug is fixed
    image_count = count_images_in_pdf(pdf_path)
    expected_diagram_count = len(enhanced_doc['diagrams'])
    
    assert image_count >= expected_diagram_count, (
        f"Bug condition detected: Enhanced document has {expected_diagram_count} diagrams "
        f"but PDF contains {image_count} embedded images. "
        f"Expected at least {expected_diagram_count} images. "
        f"This confirms the bug exists across multiple diagram types."
    )


def test_bug_condition_diagram_with_section_reference(tmp_path) -> None:
    """
    **Property 1: Bug Condition** - Diagram Placement Near Section
    
    Test Case: Diagram with section_ref should be placed near that section
    
    **EXPECTED OUTCOME ON UNFIXED CODE**: Test FAILS (diagram not in PDF at all)
    **EXPECTED OUTCOME ON FIXED CODE**: Test PASSES (diagram appears in PDF)
    
    Counterexample: Diagram with section_ref is completely missing from PDF.
    """
    # Arrange: Create enhanced document with diagram linked to specific section
    enhanced_doc = {
        "title": "API Documentation",
        "abstract": "API specification with endpoint diagram",
        "artifact_type": "spec",
        "source_path": "test/api.md",
        "enhanced": True,
        "sections": [
            {
                "heading": "Introduction",
                "content": "API overview section",
                "type": "normal"
            },
            {
                "heading": "User Endpoints",
                "content": "Endpoints for user management: GET /users, POST /users, DELETE /users",
                "type": "normal"
            },
            {
                "heading": "Conclusion",
                "content": "Summary section",
                "type": "normal"
            }
        ],
        "diagrams": [
            {
                "type": "api_endpoint",
                "title": "User Endpoints Diagram",
                "section_ref": "User Endpoints",
                "mermaid_code": "graph LR\n  Client[Client]\n  EP0[\"GET /users\"]\n  EP1[\"POST /users\"]\n  EP2[\"DELETE /users\"]\n  Client --> EP0\n  Client --> EP1\n  Client --> EP2",
                "endpoints": [
                    {"method": "GET", "path": "/users"},
                    {"method": "POST", "path": "/users"},
                    {"method": "DELETE", "path": "/users"}
                ],
                "id": "api-users"
            }
        ]
    }
    
    # Act: Render PDF using UNFIXED RenderingService
    service = RenderingService(str(tmp_path))
    result = service.render(
        artifact_id="test-api",
        structured_json=enhanced_doc,
        artifact_type="spec",
        source_path="test/api.md"
    )
    
    pdf_path = Path(result["pdf_path"])
    
    # Assert: PDF should exist
    assert pdf_path.exists(), "PDF should be generated"
    
    # Assert: Check bug condition - diagram should be embedded in PDF
    # On UNFIXED code: This will FAIL (image_count = 0), proving diagram is not placed
    # On FIXED code: This will PASS (image_count >= 1), proving diagram is placed
    image_count = count_images_in_pdf(pdf_path)
    
    assert image_count >= 1, (
        f"Bug condition detected: Enhanced document has diagram with section_ref='User Endpoints' "
        f"but PDF contains {image_count} embedded images. "
        f"Expected at least 1 image. Diagram is completely missing from PDF."
    )


def test_empty_diagrams_array_should_pass(tmp_path) -> None:
    """
    **Preservation Test** - Empty Diagrams Array
    
    Test Case: Enhanced document with empty diagrams array should render without errors
    
    **EXPECTED OUTCOME**: This test should PASS on both unfixed and fixed code.
    
    This validates that the bug condition does NOT apply when diagrams array is empty.
    """
    # Arrange: Create enhanced document with empty diagrams array
    enhanced_doc = {
        "title": "Text-Only Documentation",
        "abstract": "No diagrams in this document",
        "artifact_type": "spec",
        "source_path": "test/text-only.md",
        "enhanced": True,
        "sections": [
            {
                "heading": "Introduction",
                "content": "This is a text-only section with no diagrams.",
                "type": "normal"
            },
            {
                "heading": "Details",
                "content": "More text content without any visual diagrams.",
                "type": "normal"
            }
        ],
        "diagrams": []  # Empty diagrams array - bug condition does NOT apply
    }
    
    # Act: Render PDF using RenderingService
    service = RenderingService(str(tmp_path))
    result = service.render(
        artifact_id="test-text-only",
        structured_json=enhanced_doc,
        artifact_type="spec",
        source_path="test/text-only.md"
    )
    
    pdf_path = Path(result["pdf_path"])
    
    # Assert: PDF should exist and render successfully
    assert pdf_path.exists(), "PDF should be generated for text-only document"
    
    # Assert: Image count should be 0 (no diagrams requested)
    # This is expected and correct behavior - not a bug condition
    image_count = count_images_in_pdf(pdf_path)
    assert image_count == 0, (
        f"Text-only document should have 0 images, but found {image_count}. "
        f"This is actually fine - the test validates empty diagrams array works correctly."
    )
    
    # This test passing confirms preservation: text-only documents work fine
    print("✓ Preservation validated: Empty diagrams array renders correctly")


def test_diagram_generation_service_produces_mermaid_code() -> None:
    """
    **Unit Test** - Verify DiagramGenerationService produces Mermaid code
    
    This test validates that the diagram generation service can produce valid Mermaid code
    from diagram specifications. This is a prerequisite for the bug fix.
    """
    # Arrange: Create diagram service
    service = DiagramGenerationService()
    
    # Test architecture diagram
    arch_spec = {
        "type": "architecture",
        "title": "Test Architecture",
        "components": ["Frontend", "Backend", "Database"]
    }
    
    # Act: Generate Mermaid code
    mermaid_code = service.generate_mermaid_diagram(arch_spec)
    
    # Assert: Mermaid code should be generated
    assert mermaid_code, "Mermaid code should be generated for architecture diagram"
    assert "graph" in mermaid_code, "Architecture diagram should use graph syntax"
    assert "Frontend" in mermaid_code, "Component names should appear in Mermaid code"
    assert "Backend" in mermaid_code, "Component names should appear in Mermaid code"
    assert "Database" in mermaid_code, "Component names should appear in Mermaid code"
    
    print(f"✓ Generated Mermaid code:\n{mermaid_code}")


def test_document_enhancement_creates_diagram_specs() -> None:
    """
    **Unit Test** - Verify DocumentEnhancementService creates diagram specifications
    
    This test validates that the document enhancement service analyzes content
    and generates diagram specifications. However, it does NOT populate mermaid_code
    field (this is part of the bug - the integration step is missing).
    """
    # Arrange: Create enhancement service
    service = DocumentEnhancementService()
    
    structured_doc = {
        "title": "System Design",
        "abstract": "Design document",
        "source_path": "test/design.md",
        "sections": [
            {
                "heading": "System Architecture",
                "content": "Our system consists of the FrontendService component, BackendService module, and DatabaseService layer.",
                "type": "normal"
            }
        ]
    }
    
    # Act: Enhance document
    enhanced = service.enhance_document(structured_doc, "spec")
    
    # Assert: Diagrams should be generated
    assert "diagrams" in enhanced, "Enhanced document should have diagrams array"
    diagrams = enhanced["diagrams"]
    assert len(diagrams) >= 1, "At least one diagram should be suggested for architecture content"
    
    # Check diagram structure
    arch_diagram = diagrams[0]
    assert arch_diagram["type"] == "architecture", "Diagram type should be architecture"
    assert "title" in arch_diagram, "Diagram should have title"
    assert "section_ref" in arch_diagram, "Diagram should have section_ref"
    
    # NOTE: On unfixed code, mermaid_code field will NOT be populated
    # This is part of the root cause - the integration step is missing
    print(f"✓ Diagram spec created: {arch_diagram}")
    print(f"  Has mermaid_code: {'mermaid_code' in arch_diagram and arch_diagram['mermaid_code']}")
