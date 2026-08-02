"""
Regression test for the PDF viewer "blank box" bug: FileResponse defaults
content_disposition_type to "attachment" whenever filename= is passed,
which makes browsers download the PDF instead of rendering it inline in
the frontend's <object data="..."> embed. download_pdf() must explicitly
request "inline".
"""

import app.api.routes as routes
from fastapi import HTTPException
import pytest


class FakeCursor:
    def __init__(self, row):
        self._row = row

    def execute(self, query, params):
        pass

    def fetchone(self):
        return self._row

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeConnection:
    def __init__(self, row):
        self._row = row

    def cursor(self):
        return FakeCursor(self._row)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeRepo:
    def __init__(self, pdf_path):
        self._pdf_path = pdf_path

    def _connect(self):
        return FakeConnection({"pdf_path": self._pdf_path})


def test_download_pdf_sets_inline_content_disposition(tmp_path, monkeypatch):
    pdf_path = tmp_path / "artifact-1-v1.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake pdf content")

    monkeypatch.setattr(routes, "get_api_key", lambda: "dev-key")
    monkeypatch.setattr(routes, "get_repository", lambda: FakeRepo(str(pdf_path)))

    response = routes.download_pdf(version_id="version-1", api_key="dev-key", authorization=None)

    assert response.headers["content-disposition"] == f'inline; filename="{pdf_path.name}"'


def test_download_pdf_rejects_wrong_api_key(tmp_path, monkeypatch):
    monkeypatch.setattr(routes, "get_api_key", lambda: "dev-key")
    monkeypatch.setattr(routes, "get_repository", lambda: FakeRepo(str(tmp_path / "x.pdf")))

    with pytest.raises(HTTPException) as exc_info:
        routes.download_pdf(version_id="version-1", api_key="wrong-key", authorization=None)
    assert exc_info.value.status_code == 401


def test_download_pdf_404s_when_version_missing(monkeypatch):
    monkeypatch.setattr(routes, "get_api_key", lambda: "dev-key")

    class MissingRowRepo(FakeRepo):
        def _connect(self):
            return FakeConnection(None)

    monkeypatch.setattr(routes, "get_repository", lambda: MissingRowRepo("unused"))

    with pytest.raises(HTTPException) as exc_info:
        routes.download_pdf(version_id="version-missing", api_key="dev-key", authorization=None)
    assert exc_info.value.status_code == 404
