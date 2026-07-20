import sys

import pytest


@pytest.fixture
def block_imports(monkeypatch):
    """
    Makes `import <name>` raise ImportError for the given modules, even when
    they are installed.

    Setting a module to None in sys.modules is the documented way to force an
    ImportError. Without this, the "missing ML backend" tests would only be
    meaningful in an environment where requirements-ml.txt is absent (CI), and
    would fail for any contributor who has the heavy backends installed.
    """
    def _block(*names: str):
        for name in names:
            # Drop already-imported submodules so the package cannot be
            # resolved from cache (e.g. pyannote.audio via pyannote).
            for loaded in list(sys.modules):
                if loaded == name or loaded.startswith(f"{name}."):
                    monkeypatch.delitem(sys.modules, loaded, raising=False)
            monkeypatch.setitem(sys.modules, name, None)

    return _block
