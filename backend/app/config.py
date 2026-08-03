from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


_DEFAULT_SYMBOLS_PATH = str(Path(__file__).parent.parent / "symbols")
_DEFAULT_STATIC_PATH = str(Path(__file__).parent.parent / "static")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    symbols_path: str = _DEFAULT_SYMBOLS_PATH
    static_path: str = _DEFAULT_STATIC_PATH
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,https://spd-fe-2.app.tc1.airbase.sg"
    app_version: str = "1.0.0"
    symbols_admin_key: str = ""

    # ── Request limits ──────────────────────────────────────────────────────
    # /api/evaluate and /api/export/docx are unauthenticated and publicly
    # reachable, so a single request must not be able to exhaust the pod.
    # See the security risk assessment (held outside this repo), R-01/R-02/R-03.
    #
    # Env-overridable on purpose: the safe ceiling depends on the container's
    # memory limit, which currently differs between k8s/ (256Mi) and the
    # GovPaaS console (1024Mi) — that divergence is tracked as R-16.

    # build_adjacency's proximity pass is O(total_ports²) with an O(elements²)
    # outer loop. Measured worst case at these caps: ~1.4s. Raising
    # max_total_ports is the change that costs the most — it is quadratic.
    max_elements: int = 1000
    max_pipes: int = 2000
    max_total_ports: int = 4000

    # Encoded upload ceiling, and the decoded-pixel ceiling enforced before
    # Pillow allocates. 25M px x 3 bytes after .convert("RGB") is ~75MB.
    # Pillow's own default (~89.5M px, ~268MB) is above what this pod
    # survives, so it cannot be relied on — see image_annotator.py.
    max_image_bytes: int = 10 * 1024 * 1024
    max_image_pixels: int = 25_000_000

    # DOCX export: every crop is held in memory for the life of the request,
    # so the total is what actually bounds memory, not the per-file size.
    max_report_rows: int = 1000
    max_crops: int = 200
    max_total_crop_bytes: int = 32 * 1024 * 1024

    @property
    def symbols_dir(self) -> Path:
        return Path(self.symbols_path)

    @property
    def static_dir(self) -> Path:
        return Path(self.static_path)

    @property
    def default_symbols_dir(self) -> Path:
        return self.symbols_dir / "default"

    @property
    def custom_symbols_dir(self) -> Path:
        return self.symbols_dir / "custom"

    @property
    def manifest_path(self) -> Path:
        return self.symbols_dir / "manifest.json"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
