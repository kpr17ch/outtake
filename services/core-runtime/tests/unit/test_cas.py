from pathlib import Path

from core.storage.cas import ContentStore


def test_content_store_put_and_exists(tmp_path: Path) -> None:
    src = tmp_path / "source.mp4"
    src.write_bytes(b"fake video bytes")
    store = ContentStore(tmp_path)

    cas_hash = store.put(src)
    assert len(cas_hash) == 64
    assert store.exists(cas_hash, suffix=".mp4")
    stored_path = store.get_path(cas_hash, suffix=".mp4")
    assert stored_path.read_bytes() == b"fake video bytes"
